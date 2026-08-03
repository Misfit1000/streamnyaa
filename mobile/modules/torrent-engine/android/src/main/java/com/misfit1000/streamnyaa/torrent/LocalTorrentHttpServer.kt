package com.misfit1000.streamnyaa.torrent

import fi.iki.elonen.NanoHTTPD
import java.io.File
import java.io.InputStream
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.TimeUnit
import kotlin.math.min

class LocalTorrentHttpServer(
  private val fileProvider: () -> File?,
  private val sizeProvider: () -> Long,
  private val readableBytesProvider: (Long) -> Long,
  private val mimeProvider: () -> String,
) : NanoHTTPD("127.0.0.1", 0) {
  override fun serve(session: IHTTPSession): Response {
    if (session.uri != "/video") return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found")
    val file = fileProvider()?.takeIf { it.exists() }
      ?: return newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, MIME_PLAINTEXT, "Buffering")
    val total = sizeProvider()
    if (total <= 0L) return newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, MIME_PLAINTEXT, "Metadata unavailable")
    val range = session.headers["range"]?.removePrefix("bytes=")?.substringBefore(',')
    val requestedStart = range?.substringBefore('-')?.toLongOrNull() ?: 0L
    if (requestedStart < 0L || requestedStart >= total) {
      return newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, MIME_PLAINTEXT, "Range unavailable").apply {
        addHeader("Content-Range", "bytes */$total")
      }
    }
    val start = requestedStart.coerceAtMost(total - 1)
    val requestedEnd = range?.substringAfter('-', "")?.toLongOrNull()?.coerceIn(start, maxOf(start, total - 1)) ?: (total - 1)
    val length = requestedEnd - start + 1
    val input = GrowingFileInputStream(file, start, length, readableBytesProvider)
    val response = newFixedLengthResponse(if (range == null) Response.Status.OK else Response.Status.PARTIAL_CONTENT, mimeProvider(), input, length)
    response.addHeader("Accept-Ranges", "bytes")
    response.addHeader("Content-Length", length.toString())
    response.addHeader("Connection", "keep-alive")
    if (range != null) response.addHeader("Content-Range", "bytes $start-$requestedEnd/$total")
    response.addHeader("Cache-Control", "no-store")
    return response
  }
}

private class GrowingFileInputStream(
  file: File,
  start: Long,
  private var remaining: Long,
  private val readableBytesProvider: (Long) -> Long,
) : InputStream() {
  private val random = RandomAccessFile(file, "r")
  private val open = AtomicBoolean(true)
  private var position = start

  init { random.seek(start) }

  override fun read(): Int {
    val byte = ByteArray(1)
    return if (read(byte, 0, 1) == 1) byte[0].toInt() and 0xff else -1
  }

  override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
    if (!open.get() || remaining <= 0) return -1
    val waitStarted = System.nanoTime()
    var available = readableBytesProvider(position)
    while (open.get() && available <= 0L) {
      if (System.nanoTime() - waitStarted > TimeUnit.SECONDS.toNanos(45)) return -1
      try {
        Thread.sleep(80)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        return -1
      }
      available = readableBytesProvider(position)
    }
    if (!open.get()) return -1
    val count = min(min(length.toLong(), remaining), available).toInt()
    if (count <= 0) return -1
    val read = runCatching { random.read(buffer, offset, count) }.getOrDefault(-1)
    if (read > 0) { position += read; remaining -= read }
    return read
  }

  override fun close() { open.set(false); random.close(); super.close() }
}
