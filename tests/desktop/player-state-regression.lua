local mp = require "mp"
local actual_command = mp.commandv
local now = 1000
local callbacks, properties, commands, messages, observers = {}, {}, {}, {}, {}
local last_ass = ""

-- Load the real skin against a deterministic MPV boundary. Event callbacks,
-- reloads, cache telemetry, and time are exercised without fetching a torrent.
mp.get_time = function() return now end
mp.register_event = function(name, callback)
  callbacks[name] = callbacks[name] or {}
  table.insert(callbacks[name], callback)
end
mp.observe_property = function(name, _, callback) observers[name] = callback end
mp.register_script_message = function(name, callback) messages[name] = callback end
mp.add_periodic_timer = function() return { stop = function() end, resume = function() end } end
mp.add_timeout = function() return { kill = function() end } end
mp.add_key_binding = function() end
mp.add_forced_key_binding = function() end
mp.get_property = function(name, default) return properties[name] or default end
mp.get_property_number = function(name, default) return properties[name] or default end
mp.get_property_native = function(name, default) return properties[name] or default end
mp.set_property = function(name, value) properties[name] = value return true end
mp.set_property_number = mp.set_property
mp.set_property_bool = mp.set_property
mp.get_osd_size = function() return 1280, 720, 16 / 9 end
mp.set_osd_ass = function(_, _, text) last_ass = text end
mp.commandv = function(...) table.insert(commands, {...}) return true end
mp.command_native = function(command) table.insert(commands, command) return nil end
require("mp.options").read_options = function() end

local directory = require("mp.utils").split_path(debug.getinfo(1, "S").source:sub(2))
dofile(directory .. "/../../desktop/src-tauri/bin/streamnyaa-player.lua")

local function upvalue(fn, name)
  for index = 1, 80 do
    local key, value = debug.getupvalue(fn, index)
    if not key then break end
    if key == name then return value end
  end
  error("Missing skin test boundary: " .. name)
end
local state = upvalue(native_buffering_active, "state")
local ui = upvalue(reset_stall_watchdog, "ui")
local meta = upvalue(active_cover_metadata, "player_meta")
local function copy(value)
  local result = {}
  for key, item in pairs(value) do result[key] = item end
  return result
end
local base_state, base_ui = copy(state), copy(ui)
local function reset()
  clear_cover_overlay()
  for key in pairs(state) do state[key] = nil end
  for key in pairs(ui) do ui[key] = nil end
  for key, value in pairs(base_state) do state[key] = value end
  for key, value in pairs(base_ui) do ui[key] = value end
  now, commands, properties = 1000, {}, {}
  state.path, state.duration, state.pos = "test-stream.mkv", 600, 120
  state.has_started_playback, state.idle, state.core_idle = true, false, false
  state.paused_for_cache, state.demuxer_cache_duration = true, 0
  ui.last_video_path, ui.last_video_position = state.path, state.pos
  ui.playhead_last_advance_at = now
end
local count = 0
local function check(condition, message)
  if not condition then error(message) end
  count = count + 1
end
local function event(name)
  for _, fn in ipairs(callbacks[name] or {}) do fn({reason = "stop"}) end
end

local ok, error_message = pcall(function()
  reset()
  state.cache_buffering_percent = 0
  check(buffering_display_percent() == 0, "Zero cache fill must stay zero")
  state.cache_buffering_percent = 100
  check(buffering_display_percent() == 100, "A full buffer must remain 100 percent")
  state.cache_buffering_percent = 37
  check(buffering_display_percent() == 37, "Use measured MPV cache fill")
  state.cache_buffering_percent, state.demuxer_cache_duration = nil, 9
  check(buffering_display_percent() == 50, "Seconds fallback must use the actual buffer target")
  state.demuxer_cache_duration, state.cache_end = 0, 600
  check(buffered_seconds() == 0, "Fresh zero duration must defeat stale cache-end")
  state.demuxer_cache_duration = nil
  update_demuxer_cache({["cache-end"] = 500, ["seekable-ranges"] = {{start = 300, ["end"] = 500}}})
  check(buffered_seconds() == nil, "Disconnected cached ranges are not playable buffer")
  state.demuxer_cache_duration = 9
  update_demuxer_cache({underrun = true})
  check(buffered_seconds() == 9, "A cache-state update must not erase duration telemetry")

  reset()
  ui.settings_open = true
  check(stall_watchdog_allowed(), "Settings must not disable recovery")
  state.paused, state.paused_for_cache = true, false
  check(not stall_watchdog_allowed(), "Deliberate pauses must remain protected")
  state.paused, state.paused_for_cache, state.seeking = false, true, true
  check(not stall_watchdog_allowed(), "Intentional seeking must remain protected")

  reset()
  ui.stall_last_pos, ui.stall_last_buffer, ui.stall_last_progress_at = 120, 0, now - 13
  check_playback_stall()
  check(ui.recovery_attempt and ui.recovery_attempt.kind == "retry", "No-progress stream must be reopened")
  local attempt = ui.recovery_attempt
  event("end-file")
  event("file-loaded")
  check(ui.recovery_attempt == attempt, "Reload events must preserve the recovery deadline")
  state.idle, state.duration = true, 0
  now = now + 11
  check_startup_stream_stall()
  check(ui.recovery_attempt.kind == "backup", "Idle decoder reload must still reach backup")
  now = now + 11
  check_startup_stream_stall()
  check(ui.recovery_terminal, "Unanswered backup must stop infinite loading")
  local command_count = #commands
  now = now + 100
  check_startup_stream_stall()
  check(#commands == command_count, "Terminal recovery must not repeatedly reopen streams")
  activate_region({id = "recovery_retry"}, {x = 0, y = 0})
  check(not ui.recovery_terminal and ui.recovery_attempt.kind == "retry", "Manual retry must restart a bounded attempt after idle failure")
  reset()
  state.path, ui.last_video_path, ui.recovery_terminal = "", "", true
  activate_region({id = "recovery_retry"}, {x = 0, y = 0})
  local retry_command
  for _, command in ipairs(commands) do
    if command[2] == "streamnyaa-player-recovery-request" then retry_command = command end
  end
  check(retry_command and retry_command[3] == "retry" and not ui.recovery_terminal, "A pre-stream failure must retry through the app, not reload an empty URL")

  reset()
  request_same_source_recovery("watchdog")
  event("playback-restart")
  check(ui.recovery_attempt ~= nil, "Restart events alone do not prove successful recovery")
  check(ui.recovery_attempt.restart_seen, "Recovery must observe decoder restart")
  observers["time-pos"]("time-pos", 120.5)
  check(ui.recovery_attempt == nil, "Advancing video must finish recovery")
  reset()
  request_same_source_recovery("watchdog")
  seek_relative(-60)
  check(ui.recovery_attempt.position == 60, "A backward seek must replace a pending recovery checkpoint")
  reset()
  state.has_started_playback, state.pos = false, 0
  observers["time-pos"]("time-pos", 120)
  check(not state.has_started_playback, "A resume timestamp is not a decoded frame")
  reset()
  request_same_source_recovery("watchdog")
  attempt = ui.recovery_attempt
  observers["path"]("path", "")
  observers["path"]("path", "test-stream.mkv")
  check(ui.recovery_attempt == attempt, "Transient path changes during reload must preserve retry state")
  state.paused, state.paused_for_cache = true, false
  check_recovery_deadline()
  now = now + 60
  check_recovery_deadline()
  check(ui.recovery_attempt.kind == "retry", "A deliberate pause must suspend recovery deadlines")

  reset()
  ui.stall_last_pos, ui.stall_last_buffer, ui.stall_last_progress_at = 120, 0, now - 1
  state.demuxer_cache_duration = 1
  ui.playhead_last_advance_at = now - 61
  check_playback_stall()
  check(ui.recovery_attempt ~= nil, "Trickle data cannot extend buffering indefinitely")

  reset()
  state.cache_buffering_percent = 50
  draw(true, "test-circle")
  check(last_ass:find("50%%") ~= nil, "Percentage must render below the circular loader")
  check(not last_ass:find("of 18s ready", 1, true), "Buffering UI must not include the old status card")
  state.cache_buffering_percent, state.demuxer_cache_duration, state.cache_end = nil, nil, 0
  draw(true, "test-unknown")
  check(last_ass:find("Measuring buffer", 1, true) ~= nil, "Missing measurement must not become fabricated zero percent")
  ui.recovery_terminal = true
  draw(true, "test-terminal")
  check(last_ass:find("Playback couldn't continue", 1, true) ~= nil, "Terminal failure must replace the spinner with actions")

  reset()
  state.has_started_playback, state.duration = false, 600
  messages["streamnyaa-playback-ready"]()
  check(not state.has_started_playback and is_loading(), "Known duration or shell readiness must not imply a video frame")

  reset()
  local fixture = os.tmpname()
  local file = assert(io.open(fixture, "wb"))
  file:write(string.rep(string.char(25, 40, 60, 255), 16 * 9))
  file:close()
  meta.coverBackgroundBgraPath, meta.coverBackgroundWidth, meta.coverBackgroundHeight = fixture, 16, 9
  local cover = update_cover_overlay(true, 1280, 720, 1)
  check(cover ~= nil, "BGRA artwork must use the supported bitmap API")
  local overlay = commands[#commands]
  check(overlay[1] == "overlay-add" and overlay[11] == 1280 and overlay[12] == 720, "Artwork must scale to the viewport")
  command_count = #commands
  update_cover_overlay(true, 1280, 720, 1)
  check(#commands == command_count, "Unchanged artwork must not re-upload every animation frame")
  clear_cover_overlay()
  local normal_command = mp.command_native
  mp.command_native = function() return nil, "Video output is not ready" end
  update_cover_overlay(true, 1280, 720, 1)
  mp.command_native = normal_command
  now = now + 1.1
  check(update_cover_overlay(true, 1280, 720, 1) ~= nil, "A temporary video-output error must not permanently remove artwork")
  clear_cover_overlay()
  os.remove(fixture)
end)

if ok then
  mp.msg.info("StreamNyaa player-state regression passed: " .. count .. " assertions")
  actual_command("quit", 0)
else
  mp.msg.error("StreamNyaa player-state regression FAILED: " .. tostring(error_message))
  actual_command("quit", 1)
end
