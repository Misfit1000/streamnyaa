local mp = require "mp"
local utils = require "mp.utils"
local output = assert(os.getenv("STREAMNYAA_RENDER_OUTPUT"), "Render output folder is required")
local directory = utils.split_path(debug.getinfo(1, "S").source:sub(2))
dofile(directory .. "/../../desktop/src-tauri/bin/streamnyaa-player.lua")
local function upvalue(fn, name)
  for index = 1, 80 do
    local key, value = debug.getupvalue(fn, index)
    if not key then break end
    if key == name then return value end
  end
  error("Missing render boundary " .. name)
end
local state = upvalue(native_buffering_active, "state")
local ui = upvalue(reset_stall_watchdog, "ui")
local meta = upvalue(active_cover_metadata, "player_meta")
local fixture = output .. "/landscape.bgra"
local file = assert(io.open(fixture, "wb"))
for y = 0, 359 do
  local row = {}
  local alpha = math.max(0, math.min(1, 1 - (y / 360 - 0.26) / 0.24))
  for x = 0, 639 do
    local red = 30 + 130 * x / 640
    local green = 70 + 75 * y / 360
    local blue = 190 - 120 * x / 640
    row[#row + 1] = string.char(math.floor(blue * alpha), math.floor(green * alpha), math.floor(red * alpha), math.floor(255 * alpha))
  end
  file:write(table.concat(row))
end
file:close()

mp.add_timeout(0.7, function()
  state.path, state.duration, state.pos = "render-fixture.mkv", 600, 120
  state.has_started_playback, state.idle, state.core_idle = false, false, true
  state.paused, state.paused_for_cache = false, true
  ui.loading_override_until = mp.get_time() + 5
  ui.recovery_attempt, ui.recovery_terminal = nil, false
  meta.animeTitle, meta.episodeNumber = "Landscape artwork", "3"
  meta.coverBackgroundBgraPath, meta.coverBackgroundWidth, meta.coverBackgroundHeight = fixture, 640, 360
  draw(true, "render-artwork")
  mp.add_timeout(0.4, function()
    mp.commandv("screenshot-to-file", output .. "/artwork.png", "window")
    state.has_started_playback, state.core_idle = true, false
    state.cache_buffering_active, state.cache_buffering_percent = true, 47
    state.demuxer_cache_duration = 9
    ui.loading_override_until, ui.first_video_frame_cover_until = 0, 0
    draw(true, "render-buffering")
    mp.add_timeout(0.4, function()
      mp.commandv("screenshot-to-file", output .. "/buffering.png", "window")
      mp.commandv("quit")
    end)
  end)
end)
