local mp = require "mp"
local assdraw = require "mp.assdraw"
local msg = require "mp.msg"
local utils = require "mp.utils"
local options = require "mp.options"

-- StreamNyaa Desktop MPV OSC.
-- MPV launches with --osc=no, so this file is the only player overlay.

local C = {
  accent = "2D12B3",      -- #b3122d
  hover = "3C1DDC",       -- #dc1d3c
  white = "F7F5F5",       -- #f5f5f7
  secondary = "C2B8B8",   -- #b8b8c2
  muted = "7A7070",       -- #70707a
  black = "000000",
  panel = "161212",       -- #121216
  panel_2 = "201D1D",     -- #1d1d20
  line = "FFFFFF",
  track = "FFFFFF",
  buffer = "FFFFFF",
  shadow = "000000",
}

local script_options = {
  meta_file = "",
  subtitle_request_file = "",
  next_episode_request_file = "",
  settings_request_file = "",
  preferences_file = "",
  stall_test_mode = false,
  debug_input = false,
}

options.read_options(script_options)
options.read_options(script_options, "streamnyaa_player")
msg.info(
  "[StreamNyaa Lua] script options resolved: meta_file="
    .. tostring(script_options.meta_file or "")
    .. " subtitle_request_file="
    .. tostring(script_options.subtitle_request_file or "")
    .. " next_episode_request_file="
    .. tostring(script_options.next_episode_request_file or "")
    .. " settings_request_file="
    .. tostring(script_options.settings_request_file or "")
    .. " preferences_file="
    .. tostring(script_options.preferences_file or "")
)

local DEBUG_INPUT = script_options.debug_input == true
local DEBUG_PERF = false
local DEBUG_SUBMENU_PERF = false
local DEBUG_SCRIPT_MESSAGES = false
local DEBUG_FORCE_MINIMAL_OSD = false
local ENABLE_COVER_BITMAP_OVERLAY = true
local DEBUG_COVER_LOADING = false
local DEBUG_LOADING_DRAW = false
local DEBUG_COVER_TEST = false
local BUFFER_TARGET_SECONDS = 18
local BUFFER_RECOVERY_TARGET_SECONDS = 24
local BUFFER_STRESSED_TARGET_SECONDS = 30
local STALL_SAMPLE_SECONDS = 0.5
local STALL_DETECT_SECONDS = 2.5
local STALL_RECOVERY_SECONDS = 12
local STALL_ACTION_SECONDS = 10
local STALL_BACKUP_WAIT_SECONDS = 10
local STALL_LOW_BUFFER_SECONDS = 2.5
local STARTUP_STREAM_RETRY_SECONDS = 12
local STARTUP_STREAM_BACKUP_SECONDS = 8
local STARTUP_STREAM_ACTION_SECONDS = 8
local MAX_CONTINUOUS_BUFFERING_SECONDS = 60
if script_options.stall_test_mode then
  STARTUP_STREAM_RETRY_SECONDS = 0.2
  STARTUP_STREAM_BACKUP_SECONDS = 0.2
  STARTUP_STREAM_ACTION_SECONDS = 0.2
end

msg.info("[StreamNyaa Lua] streamnyaa-player.lua loaded")

local state = {
  duration = 0,
  pos = 0,
  paused = false,
  seeking = false,
  volume = 100,
  muted = false,
  speed = 1,
  idle = true,
  core_idle = false,
  paused_for_cache = false,
  fullscreen = false,
  path = "",
  filename = "",
  title = "",
  cache_percent = 0,
  cache_buffering_percent = nil,
  cache_buffering_active = false,
  demuxer_buffering_percent = nil,
  demuxer_cache_duration = nil,
  demuxer_state_duration = nil,
  demuxer_underrun = false,
  cache_end = 0,
  chapters = {},
  sid = "no",
  aid = "auto",
  sub_visible = true,
  sub_delay = 0,
  audio_delay = 0,
  video_aspect = "default",
  video_zoom = 0,
  loop_file = false,
  remember_speed = true,
  tracks = {},
  autoplay = false,
  skip_intro = false,
  skip_outro = false,
  mini_player = false,
  subtitle_style = {
    font_size = "medium",
    position = "normal",
    text_color = "white",
    outline = "medium",
    shadow = "off",
    background = "light",
    custom = false,
  },
  has_started_playback = false,
}

local ui = {
  visible = true,
  settings_open = false,
  submenu = "main",
  dragging = nil,
  drag_ratio = nil,
  drag_preview_ratio = nil,
  drag_started_at = 0,
  drag_start_x = 0,
  drag_start_y = 0,
  drag_has_moved = false,
  last_drag_command_at = 0,
  last_drag_draw_at = 0,
  mouse_down_region = nil,
  last_interaction = mp.get_time(),
  last_direct_interaction = 0,
  last_draw_at = 0,
  pending_draw = false,
  draw_count = 0,
  last_perf_log = mp.get_time(),
  regions_ready = false,
  region_width = 0,
  region_height = 0,
  anim_started = mp.get_time(),
  skip_intro_applied = false,
  skip_outro_applied = false,
  loading_override_until = 0,
  first_video_frame_cover_until = 0,
  hover_region_id = "",
  subtitle_menu_scroll = 0,
  last_meta_poll_at = 0,
  cover_loaded_log_key = "",
  cover_missing_log_key = "",
  title_layout_key = "",
  title_layout = nil,
  native_loading_osd_cleared = false,
  initialized = false,
  render_has_run = false,
  marker_log_key = "",
  chapter_state_key = "",
  last_next_episode_request_key = "",
  end_overlay = false,
  end_overlay_key = "",
  end_next_pending = false,
  end_request_id = '',
  end_status = 'idle',
  end_focus = 'end_next_episode',
  end_next_pending_at = 0,
  end_next_request_token = 0,
  eof_handled_key = "",
  eof_candidate_key = "",
  last_buffering_active = false,
  last_buffering_percent = nil,
  inferred_buffering = false,
  playback_stalled = false,
  stall_actions_visible = false,
  stall_last_pos = nil,
  stall_last_buffer = nil,
  stall_last_progress_at = 0,
  stall_started_at = 0,
  stall_recovery_attempted = false,
  stall_recovery_at = 0,
  stall_backup_requested = false,
  stall_backup_at = 0,
  source_recovery_count = 0,
  software_decoder_media = "",
  adaptive_buffer_target = BUFFER_TARGET_SECONDS,
  stall_ignore_restart_until = 0,
  recovery_restore = nil,
  recovery_attempt = nil,
  recovery_terminal = false,
  last_video_path = "",
  last_video_position = 0,
  playhead_last_advance_at = mp.get_time(),
  startup_stream_key = "",
  startup_stream_started_at = 0,
  startup_stream_retry_at = 0,
  startup_stream_retried = false,
  startup_stream_backup_at = 0,
  startup_stream_backup_requested = false,
  startup_stream_actions_visible = false,
  last_startup_loading_percent = 0,
  skip_range_state = {},
  skip_only_rendered = false,
  last_ass_text = nil,
  last_ass_width = 0,
  last_ass_height = 0,
}

local regions = {}
local player_meta = {
  animeTitle = "",
  episodeTitle = "",
  episodeNumber = "",
  loadingImagePath = "",
  loadingImageWidth = 0,
  loadingImageHeight = 0,
  coverPosterBgraPath = "",
  coverPosterWidth = 0,
  coverPosterHeight = 0,
  coverBackgroundBgraPath = "",
  coverBackgroundWidth = 0,
  coverBackgroundHeight = 0,
  artworkLayout = "",
}

local cover_overlay = nil
local cover_overlay_key = ""
local cover_overlay_retry_at = 0
local debug_cover_test_data = nil
local stall_watchdog_timer = nil
local startup_stream_watchdog_timer = nil

local menu_row_cache = {}
local menu_cache_dirty = {
  main = true,
  speed = true,
  subs = true,
  appearance = true,
  audio = true,
  video = true,
  video_aspect = true,
  video_zoom = true,
  playback = true,
}
local cached_subtitle_tracks = {}
local cached_audio_tracks = {}
local track_cache_generation = 0

local AUTO_HIDE_SECONDS = 3.0
local SEEK_DRAG_COMMAND_INTERVAL = 0.075
local VOLUME_DRAG_COMMAND_INTERVAL = 0.075
local DRAG_DRAW_INTERVAL = 0.016
local SPEEDS = { 0.5, 0.75, 1, 1.25, 1.5, 2 }
local VIDEO_ASPECT_OPTIONS = {
  { label = "Default", value = "default", property = "-1" },
  { label = "16:9", value = "16:9", property = "16:9" },
  { label = "4:3", value = "4:3", property = "4:3" },
  { label = "21:9", value = "21:9", property = "21:9" },
}
local VIDEO_ZOOM_OPTIONS = {
  { label = "Fit", value = "fit", detail = "No crop" },
  { label = "Fill", value = "fill", detail = "Light crop" },
  { label = "Zoom In", value = "in", detail = "+10%" },
  { label = "Zoom Out", value = "out", detail = "-10%" },
  { label = "Reset", value = "reset", detail = "Default" },
}
local INTRO_SKIP_FALLBACK_SECONDS = 85
local INTRO_EDGE_TOLERANCE_SECONDS = 1.25
local OUTRO_SKIP_FALLBACK_SECONDS = 90
local OUTRO_EDGE_TOLERANCE_SECONDS = 1.25
local SKIP_FEATURE_MIN_SECONDS = 15 * 60
local SKIP_FEATURE_MAX_SECONDS = 45 * 60
local NORMAL_EPISODE_MIN_SECONDS = 18 * 60
local NORMAL_EPISODE_MAX_SECONDS = 30 * 60
local FALLBACK_HIGH_CONFIDENCE_MIN_SECONDS = 20 * 60
local FALLBACK_HIGH_CONFIDENCE_MAX_SECONDS = 26 * 60
local INTRO_FALLBACK_START_SECONDS = 75
local INTRO_FALLBACK_END_SECONDS = 165
local INTRO_FALLBACK_NEARBY_END_SECONDS = 210
local OUTRO_FALLBACK_START_FROM_END_SECONDS = 115
local OUTRO_FALLBACK_END_FROM_END_SECONDS = 35
local MANUAL_SKIP_BUTTON_SECONDS = 7.0
local MINI_GEOMETRY = "520x292-36-78"
local NORMAL_GEOMETRY = "1120x630"
local SUBTITLE_STYLE_DEFAULT = {
  font_size = "medium",
  position = "normal",
  text_color = "white",
  outline = "medium",
  shadow = "soft",
  background = "off",
  custom = false,
}
local SUBTITLE_STYLE_OPTIONS = {
  font_size = {
    { label = "Small", value = "small", properties = { ["sub-font-size"] = 34, ["sub-scale"] = 0.86 } },
    { label = "Medium", value = "medium", properties = { ["sub-font-size"] = 42, ["sub-scale"] = 0.92 } },
    { label = "Large", value = "large", properties = { ["sub-font-size"] = 50, ["sub-scale"] = 1.05 } },
    { label = "Extra Large", value = "extra_large", properties = { ["sub-font-size"] = 58, ["sub-scale"] = 1.18 } },
  },
  position = {
    { label = "Low", value = "low", properties = { ["sub-pos"] = 96, ["sub-margin-y"] = 20 } },
    { label = "Normal", value = "normal", properties = { ["sub-pos"] = 90, ["sub-margin-y"] = 34 } },
    { label = "High", value = "high", properties = { ["sub-pos"] = 78, ["sub-margin-y"] = 68 } },
  },
  text_color = {
    { label = "White", value = "white", properties = { ["sub-color"] = "#FFF8F7" } },
    { label = "Yellow", value = "yellow", properties = { ["sub-color"] = "#FFD86B" } },
    { label = "Red", value = "red", properties = { ["sub-color"] = "#FF4B55" } },
    { label = "Cyan", value = "cyan", properties = { ["sub-color"] = "#4DD0E1" } },
  },
  outline = {
    { label = "None", value = "none", properties = { ["sub-border-size"] = 0, ["sub-border-color"] = "#06070A" } },
    { label = "Thin", value = "thin", properties = { ["sub-border-size"] = 1.3, ["sub-border-color"] = "#06070A" } },
    { label = "Medium", value = "medium", properties = { ["sub-border-size"] = 2.5, ["sub-border-color"] = "#06070A" } },
    { label = "Thick", value = "thick", properties = { ["sub-border-size"] = 4.0, ["sub-border-color"] = "#06070A" } },
  },
  shadow = {
    { label = "Off", value = "off", properties = { ["sub-shadow-offset"] = 0 } },
    { label = "Soft", value = "soft", properties = { ["sub-shadow-offset"] = 1.2 } },
    { label = "Strong", value = "strong", properties = { ["sub-shadow-offset"] = 2.8 } },
  },
  background = {
    { label = "Off", value = "off", properties = { ["sub-back-color"] = "#00000000", ["sub-border-style"] = "outline-and-shadow" } },
    { label = "Light", value = "light", properties = { ["sub-back-color"] = "#33000000", ["sub-border-style"] = "background-box" } },
    { label = "Dark", value = "dark", properties = { ["sub-back-color"] = "#AA000000", ["sub-border-style"] = "background-box" } },
  },
}
local SUBTITLE_STYLE_MENU = {
  { kind = "font_size", label = "Font Size" },
  { kind = "position", label = "Subtitle Position" },
  { kind = "text_color", label = "Text Color" },
  { kind = "outline", label = "Outline Size" },
  { kind = "shadow", label = "Shadow" },
  { kind = "background", label = "Background" },
}

local unpack_args = table.unpack or unpack

function safe_commandv(...)
  local args = { ... }
  local ok, result, err = pcall(mp.commandv, unpack_args(args))
  if not ok or result == nil or result == false then
    msg.warn("StreamNyaa player command failed: " .. tostring(err or result))
    return false
  end
  return true
end

function safe_set_property(name, value)
  return safe_commandv("set", name, tostring(value))
end

function safe_set_property_bool(name, value)
  local ok, result, err = pcall(mp.set_property_bool, name, value == true)
  if not ok or result == nil or result == false then
    msg.warn("StreamNyaa player bool property failed: " .. tostring(err))
    return safe_set_property(name, value and "yes" or "no")
  end
  return true
end

function safe_set_property_number(name, value)
  local number_value = tonumber(value) or 0
  local ok, result, err = pcall(mp.set_property_number, name, number_value)
  if not ok or result == nil or result == false then
    msg.warn("StreamNyaa player number property failed: " .. tostring(err))
    return safe_set_property(name, tostring(number_value))
  end
  return true
end

function clamp(value, min_value, max_value)
  value = tonumber(value) or min_value
  if value < min_value then return min_value end
  if value > max_value then return max_value end
  return value
end

function starts_with(value, prefix)
  return tostring(value or ""):sub(1, #prefix) == prefix
end

function debug_input(message)
  if DEBUG_INPUT then
    msg.info("[input] " .. tostring(message or ""))
  end
end

function debug_perf(message)
  if DEBUG_PERF then
    msg.info("[perf] " .. tostring(message or ""))
  end
end

function ass_escape(value)
  value = tostring(value or "")
  value = value:gsub("\\", "\\\\")
  value = value:gsub("{", "\\{")
  value = value:gsub("}", "\\}")
  return value
end

function format_time(seconds)
  seconds = math.max(0, math.floor(tonumber(seconds) or 0))
  local h = math.floor(seconds / 3600)
  local m = math.floor((seconds % 3600) / 60)
  local s = seconds % 60
  if h > 0 then
    return string.format("%d:%02d:%02d", h, m, s)
  end
  return string.format("%d:%02d", m, s)
end

function speed_label(value)
  local speed = tonumber(value or state.speed) or 1
  if math.abs(speed * 10 - math.floor(speed * 10)) < 0.01 then
    return string.format("%.1fx", speed)
  end
  return string.format("%.2fx", speed)
end

function ellipsize(value, max_chars)
  value = tostring(value or "")
  max_chars = max_chars or 64
  if #value <= max_chars then return value end
  return value:sub(1, math.max(1, max_chars - 3)) .. "..."
end

function submenu_perf(label, started_at, extra)
  if not DEBUG_SUBMENU_PERF then return end
  local elapsed = (mp.get_time() - (started_at or mp.get_time())) * 1000
  msg.info(string.format("submenu_perf %s %.1fms %s", tostring(label), elapsed, tostring(extra or "")))
end

function mark_menu_dirty(name)
  if name then menu_cache_dirty[name] = true end
end

function mark_menus_dirty(...)
  for i = 1, select("#", ...) do
    mark_menu_dirty(select(i, ...))
  end
end

function mark_all_menus_dirty()
  for name in pairs(menu_cache_dirty) do
    menu_cache_dirty[name] = true
  end
end

function font_px(s, value, min_value, max_value)
  local size = (tonumber(value) or 14) * (tonumber(s) or 1)
  if min_value then size = math.max(size, min_value) end
  if max_value then size = math.min(size, max_value) end
  return size
end

function mouse_pos()
  local mouse = mp.get_property_native("mouse-pos")
  if mouse and mouse.x and mouse.y then
    return mouse
  end
  return nil
end

function inside(mouse, x1, y1, x2, y2)
  return mouse and mouse.x >= x1 and mouse.x <= x2 and mouse.y >= y1 and mouse.y <= y2
end

function reset_regions()
  regions = {}
  ui.regions_ready = false
  ui.hover_region_id = ""
end

function add_region(id, x1, y1, x2, y2, data)
  if x2 < x1 then x1, x2 = x2, x1 end
  if y2 < y1 then y1, y2 = y2, y1 end
  regions[#regions + 1] = { id = id, x1 = x1, y1 = y1, x2 = x2, y2 = y2, data = data }
end

function hit_region()
  local mouse = mouse_pos()
  if not mouse then return nil, nil end
  for i = #regions, 1, -1 do
    local region = regions[i]
    if inside(mouse, region.x1, region.y1, region.x2, region.y2) then
      return region, mouse
    end
  end
  return nil, mouse
end

function is_settings_region(region)
  if not region or not region.id then return false end
  local id = tostring(region.id)
  return id == "settings"
    or id == "settings-panel"
    or starts_with(id, "settings:")
    or starts_with(id, "speed:")
    or starts_with(id, "seek_step:")
    or starts_with(id, "sub:")
    or starts_with(id, "appearance:")
    or starts_with(id, "style:")
    or starts_with(id, "audio:")
    or starts_with(id, "video:")
    or starts_with(id, "video_aspect:")
    or starts_with(id, "video_zoom:")
    or starts_with(id, "playback:")
end

function is_actionable_region(region)
  return region and region.id and region.id ~= "settings-panel"
end

function path(ass, color, alpha, value)
  ass:new_event()
  ass:append(string.format(
    "{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H%s&\\alpha&H%02X&\\p1}%s{\\p0}",
    color,
    clamp(alpha or 0, 0, 255),
    value
  ))
end

function rect(ass, x1, y1, x2, y2, color, alpha)
  path(ass, color, alpha or 0, string.format(
    "m %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f",
    x1, y1, x2, y1, x2, y2, x1, y2
  ))
end

function rounded_rect(ass, x1, y1, x2, y2, radius, color, alpha)
  radius = math.max(0, math.min(radius or 0, (x2 - x1) / 2, (y2 - y1) / 2))
  local k = radius * 0.5522847498
  path(ass, color, alpha or 0, string.format(
    "m %.2f %.2f l %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f l %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f l %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f l %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f",
    x1 + radius, y1,
    x2 - radius, y1,
    x2 - radius + k, y1, x2, y1 + radius - k, x2, y1 + radius,
    x2, y2 - radius,
    x2, y2 - radius + k, x2 - radius + k, y2, x2 - radius, y2,
    x1 + radius, y2,
    x1 + radius - k, y2, x1, y2 - radius + k, x1, y2 - radius,
    x1, y1 + radius,
    x1, y1 + radius - k, x1 + radius - k, y1, x1 + radius, y1
  ))
end

function circle(ass, cx, cy, radius, color, alpha)
  local k = 0.5522847498 * radius
  path(ass, color, alpha or 0, string.format(
    "m %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f",
    cx, cy - radius,
    cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy,
    cx + radius, cy + k, cx + k, cy + radius, cx, cy + radius,
    cx - k, cy + radius, cx - radius, cy + k, cx - radius, cy,
    cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius
  ))
end

function triangle(ass, x1, y1, x2, y2, x3, y3, color, alpha)
  path(ass, color, alpha or 0, string.format(
    "m %.2f %.2f l %.2f %.2f l %.2f %.2f",
    x1, y1, x2, y2, x3, y3
  ))
end

function line(ass, x1, y1, x2, y2, thickness, color, alpha)
  local dx = x2 - x1
  local dy = y2 - y1
  local length = math.sqrt(dx * dx + dy * dy)
  if length <= 0.01 then
    circle(ass, x1, y1, thickness / 2, color, alpha)
    return
  end
  local ox = -dy / length * thickness / 2
  local oy = dx / length * thickness / 2
  path(ass, color, alpha or 0, string.format(
    "m %.2f %.2f l %.2f %.2f l %.2f %.2f l %.2f %.2f",
    x1 + ox, y1 + oy,
    x2 + ox, y2 + oy,
    x2 - ox, y2 - oy,
    x1 - ox, y1 - oy
  ))
end

function draw_text(ass, x, y, align, size, color, alpha, value, bold, font, video_outline)
  ass:new_event()
  ass:append(string.format(
    "{\\an%d\\pos(%.2f,%.2f)\\fn%s\\fs%d\\bord%.2f\\3c&H101014&\\shad0\\b%d\\c&H%s&\\alpha&H%02X&}%s",
    align,
    x,
    y,
    font or "Segoe UI",
    math.max(1, math.floor(size)),
    video_outline and math.max(1, size * 0.065) or 0,
    bold and 1 or 0,
    color,
    clamp(alpha or 0, 0, 255),
    ass_escape(value)
  ))
end

function draw_spaced_text(ass, x, y, align, size, color, alpha, value, spacing, bold, font)
  ass:new_event()
  ass:append(string.format(
    "{\\an%d\\pos(%.2f,%.2f)\\fn%s\\fs%d\\fsp%.2f\\bord0\\shad0\\b%d\\c&H%s&\\alpha&H%02X&}%s",
    align,
    x,
    y,
    font or "Segoe UI",
    math.max(1, math.floor(size)),
    spacing or 0,
    bold and 1 or 0,
    color,
    clamp(alpha or 0, 0, 255),
    ass_escape(value)
  ))
end

function utf8_cp(codepoint)
  codepoint = tonumber(codepoint) or 0
  if codepoint <= 0x7F then
    return string.char(codepoint)
  elseif codepoint <= 0x7FF then
    return string.char(
      0xC0 + math.floor(codepoint / 0x40),
      0x80 + (codepoint % 0x40)
    )
  elseif codepoint <= 0xFFFF then
    return string.char(
      0xE0 + math.floor(codepoint / 0x1000),
      0x80 + (math.floor(codepoint / 0x40) % 0x40),
      0x80 + (codepoint % 0x40)
    )
  end
  return string.char(
    0xF0 + math.floor(codepoint / 0x40000),
    0x80 + (math.floor(codepoint / 0x1000) % 0x40),
    0x80 + (math.floor(codepoint / 0x40) % 0x40),
    0x80 + (codepoint % 0x40)
  )
end

local ICON_FONT = "Segoe MDL2 Assets"
local SYMBOL_FONT = "Segoe UI Symbol"
local ICON = {
  play = utf8_cp(0xE768),
  pause = utf8_cp(0xE769),
  settings = utf8_cp(0xE713),
  volume = utf8_cp(0xE767),
  mute = utf8_cp(0xE74F),
  fullscreen = utf8_cp(0xE740),
  restore = utf8_cp(0xE923),
  chevron_left = utf8_cp(0xE76B),
  chevron_right = utf8_cp(0xE76C),
  check = utf8_cp(0xE73E),
  back_10 = utf8_cp(0x21BA),
  forward_10 = utf8_cp(0x21BB),
  skip_intro = utf8_cp(0x21B7),
  dot = utf8_cp(0x25CF),
}

function draw_glyph(ass, cx, cy, size, color, glyph, font, alpha)
  draw_text(ass, cx, cy, 5, size, color, alpha or 0, glyph, false, font or ICON_FONT)
end

function draw_arc(ass, cx, cy, radius, start_degrees, arc_degrees, thickness, color, alpha)
  local last_x, last_y
  for degree = 0, arc_degrees, 5 do
    local angle = math.rad(start_degrees + degree - 90)
    local x = cx + math.cos(angle) * radius
    local y = cy + math.sin(angle) * radius
    if last_x then
      line(ass, last_x, last_y, x, y, thickness, color, alpha)
    end
    last_x, last_y = x, y
  end
  local first = math.rad(start_degrees - 90)
  local last = math.rad(start_degrees + arc_degrees - 90)
  circle(ass, cx + math.cos(first) * radius, cy + math.sin(first) * radius, thickness / 2, color, alpha)
  circle(ass, cx + math.cos(last) * radius, cy + math.sin(last) * radius, thickness / 2, color, alpha)
end

function media_title()
  local title = state.title
  if not title or title == "" then title = state.filename end
  if not title or title == "" then title = state.path end
  title = tostring(title or "")
  title = title:gsub("^.*[\\/]", "")
  title = title:gsub("%.[%w%d]+$", "")
  title = title:gsub("streamnyaa%-loading", "Loading")
  title = title:gsub("loading%-cover", "Loading")
  if title == "" then title = "StreamNyaa" end
  return ellipsize(title, 86)
end

function loading_media_title()
  local title = player_meta.animeTitle
  if not title or title == "" then title = media_title() end
  if not title or title == "" or title == "Loading" or title == "StreamNyaa" then title = "this anime" end
  return title
end

function normalize_loading_title(value)
  local title = tostring(value or "")
  title = title:gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
  if title == "" then title = "this anime" end
  return title
end

function estimated_spaced_text_width(value, size, spacing)
  local text = tostring(value or "")
  local chars = #text
  if chars <= 0 then return 0 end
  return chars * (size * 0.56) + math.max(0, chars - 1) * (spacing or 0)
end

function truncate_to_width(value, max_width, size, spacing)
  local text = tostring(value or ""):gsub("%s+$", "")
  if estimated_spaced_text_width(text, size, spacing) <= max_width then return text end
  local suffix = "..."
  while #text > 8 and estimated_spaced_text_width(text .. suffix, size, spacing) > max_width do
    text = text:sub(1, #text - 1):gsub("%s+$", "")
  end
  return text .. suffix
end

function join_words(words, first_index, last_index)
  local parts = {}
  for index = first_index, last_index do
    parts[#parts + 1] = words[index]
  end
  return table.concat(parts, " ")
end

function loading_title_layout(raw_title, width, height, s)
  local title = normalize_loading_title(raw_title)
  local artwork_layout = tostring(player_meta.artworkLayout or "landscape")
  local key = table.concat({
    title,
    artwork_layout,
    tostring(math.floor(width or 0)),
    tostring(math.floor(height or 0)),
  }, ":")
  if ui.title_layout_key == key and ui.title_layout then
    return ui.title_layout
  end

  local max_width = artwork_layout == "portrait" and width * 0.52 or width * 0.74
  local size = clamp(76 * s, 50 * s, 94 * s)
  local spacing = 0

  while size > 52 * s and estimated_spaced_text_width(title, size, spacing) > max_width do
    size = size - 2 * s
  end

  local lines = { title }
  if estimated_spaced_text_width(title, size, spacing) > max_width then
    local words = {}
    for word in title:gmatch("%S+") do words[#words + 1] = word end
    if #words > 1 then
      local best_left, best_right, best_score
      for split = 1, #words - 1 do
        local left = join_words(words, 1, split)
        local right = join_words(words, split + 1, #words)
        local left_width = estimated_spaced_text_width(left, size, spacing)
        local right_width = estimated_spaced_text_width(right, size, spacing)
        local widest = math.max(left_width, right_width)
        local overflow = math.max(0, widest - max_width)
        local balance = math.abs(#left - #right) * size * 0.08
        local score = widest + overflow * 3 + balance
        if not best_score or score < best_score then
          best_score = score
          best_left = left
          best_right = right
        end
      end
      lines = { best_left or title, best_right or "" }
      while size > 42 * s do
        local fits = true
        for _, line_value in ipairs(lines) do
          if estimated_spaced_text_width(line_value, size, spacing) > max_width then
            fits = false
            break
          end
        end
        if fits then break end
        size = size - 2 * s
      end
    end
  end

  for index, line_value in ipairs(lines) do
    lines[index] = truncate_to_width(line_value, max_width, size, spacing)
  end

  local layout = {
    lines = lines,
    size = size,
    spacing = spacing,
    line_gap = size * 1.08,
  }
  ui.title_layout_key = key
  ui.title_layout = layout
  return layout
end

function read_binary_file(path_value)
  local file = io.open(tostring(path_value or ""), "rb")
  if not file then return nil end
  local data = file:read("*all")
  file:close()
  return data
end

function generated_debug_cover_data(width, height)
  if debug_cover_test_data then return debug_cover_test_data end
  local parts = {}
  for y = 0, height - 1 do
    for x = 0, width - 1 do
      local checker = (math.floor(x / 24) + math.floor(y / 24)) % 2 == 0
      local r = checker and 255 or 0
      local g = checker and 0 or 255
      local b = 180
      parts[#parts + 1] = string.char(b, g, r, 220)
    end
  end
  debug_cover_test_data = table.concat(parts)
  return debug_cover_test_data
end

function clear_cover_overlay()
  if cover_overlay then
    pcall(mp.commandv, "overlay-remove", "3")
  end
  cover_overlay = nil
  cover_overlay_key = ""
end

function debug_cover(message)
  if DEBUG_COVER_LOADING then
    msg.info("[cover] " .. tostring(message))
  end
end

function debug_loading(message)
  if DEBUG_LOADING_DRAW then
    msg.info("[loading] " .. tostring(message))
  end
end

function active_cover_metadata()
  if DEBUG_COVER_TEST then
    return "__streamnyaa_debug_cover_test__", 360, 220, "debug"
  end

  local bg_path = tostring(player_meta.coverBackgroundBgraPath or "")
  local bg_w = tonumber(player_meta.coverBackgroundWidth) or 0
  local bg_h = tonumber(player_meta.coverBackgroundHeight) or 0
  if bg_path ~= "" and bg_w > 0 and bg_h > 0 then
    return bg_path, bg_w, bg_h, "background"
  end

  local poster_path = tostring(player_meta.coverPosterBgraPath or "")
  local poster_w = tonumber(player_meta.coverPosterWidth) or 0
  local poster_h = tonumber(player_meta.coverPosterHeight) or 0
  if poster_path ~= "" and poster_w > 0 and poster_h > 0 then
    return poster_path, poster_w, poster_h, "poster"
  end

  return "", 0, 0, "none"
end

function cover_metadata_key()
  local cover_path, cover_w, cover_h, cover_kind = active_cover_metadata()
  if cover_path == "" or cover_w <= 0 or cover_h <= 0 then return "" end
  return cover_kind .. ":" .. cover_path .. ":" .. tostring(cover_w) .. "x" .. tostring(cover_h)
end

function load_player_meta()
  local meta_file = tostring(script_options.meta_file or "")
  if meta_file == "" then
    msg.info("[StreamNyaa Lua] metadata path is empty")
    debug_cover("metadata file path is empty")
    return
  end
  msg.info("[StreamNyaa Lua] reading metadata file: " .. meta_file)

  local content = read_binary_file(meta_file)
  if not content or content == "" then
    msg.warn("[StreamNyaa Lua] metadata file missing or empty: " .. meta_file)
    debug_cover("metadata file missing or empty: " .. meta_file)
    return
  end

  local data = utils.parse_json(content)
  if type(data) ~= "table" then
    msg.warn("[StreamNyaa Lua] metadata JSON parse failed: " .. meta_file)
    debug_cover("metadata JSON parse failed: " .. meta_file)
    return
  end

  local previous_title = tostring(player_meta.animeTitle or "")
  local previous_artwork_layout = tostring(player_meta.artworkLayout or "")
  local previous_cover_key = cover_metadata_key()

  player_meta.animeTitle = tostring(data.animeTitle or data.anime_title or "")
  player_meta.episodeTitle = tostring(data.episodeTitle or data.episode_title or "")
  player_meta.episodeNumber = tostring(data.episodeNumber or data.episode_number or "")
  local offset_key = tostring(data.subtitleOffsetKey or data.subtitle_offset_key or "")
  if player_meta.subtitleOffsetKey ~= offset_key then
    player_meta.subtitleOffsetKey = offset_key
    player_meta.subtitleOffsetSeconds = clamp(tonumber(data.subtitleOffsetSeconds or data.subtitle_offset_seconds) or 0, -120, 120)
    ui.restored_offset_key = nil
  end
  player_meta.loadingImagePath = tostring(data.loadingImagePath or data.loading_image_path or "")
  player_meta.loadingImageWidth = tonumber(data.loadingImageWidth or data.loading_image_width) or 0
  player_meta.loadingImageHeight = tonumber(data.loadingImageHeight or data.loading_image_height) or 0
  player_meta.coverPosterBgraPath = tostring(data.coverPosterBgraPath or data.cover_poster_bgra_path or "")
  player_meta.coverPosterWidth = tonumber(data.coverPosterWidth or data.cover_poster_width) or 0
  player_meta.coverPosterHeight = tonumber(data.coverPosterHeight or data.cover_poster_height) or 0
  player_meta.coverBackgroundBgraPath = tostring(data.coverBackgroundBgraPath or data.cover_background_bgra_path or "")
  player_meta.coverBackgroundWidth = tonumber(data.coverBackgroundWidth or data.cover_background_width) or 0
  player_meta.coverBackgroundHeight = tonumber(data.coverBackgroundHeight or data.cover_background_height) or 0
  player_meta.artworkLayout = tostring(data.artworkLayout or data.artwork_layout or "")
  msg.info(
    "[StreamNyaa Lua] metadata parsed: title="
      .. tostring(player_meta.animeTitle or "")
      .. " episode="
      .. tostring(player_meta.episodeNumber or "")
      .. " loading_image="
      .. tostring(player_meta.loadingImagePath or "")
      .. " loading_image_size="
      .. tostring(player_meta.loadingImageWidth or 0)
      .. "x"
      .. tostring(player_meta.loadingImageHeight or 0)
      .. " poster="
      .. tostring(player_meta.coverPosterBgraPath or "")
      .. " poster_size="
      .. tostring(player_meta.coverPosterWidth or 0)
      .. "x"
      .. tostring(player_meta.coverPosterHeight or 0)
      .. " background="
      .. tostring(player_meta.coverBackgroundBgraPath or "")
      .. " background_size="
      .. tostring(player_meta.coverBackgroundWidth or 0)
      .. "x"
      .. tostring(player_meta.coverBackgroundHeight or 0)
  )
  debug_cover(
    string.format(
      "metadata loaded title=%s poster=%s %sx%s background=%s %sx%s",
      tostring(player_meta.animeTitle or ""),
      tostring(player_meta.coverPosterBgraPath or ""),
      tostring(player_meta.coverPosterWidth or 0),
      tostring(player_meta.coverPosterHeight or 0),
      tostring(player_meta.coverBackgroundBgraPath or ""),
      tostring(player_meta.coverBackgroundWidth or 0),
      tostring(player_meta.coverBackgroundHeight or 0)
    )
  )

  if previous_title ~= tostring(player_meta.animeTitle or "")
      or previous_artwork_layout ~= tostring(player_meta.artworkLayout or "") then
    ui.title_layout_key = ""
    ui.title_layout = nil
  end

  local next_cover_key = cover_metadata_key()
  if previous_cover_key ~= next_cover_key
      or previous_title ~= tostring(player_meta.animeTitle or "")
      or previous_artwork_layout ~= tostring(player_meta.artworkLayout or "") then
    clear_cover_overlay()
    ui.cover_missing_log_key = ""
    if next_cover_key ~= "" and ui.cover_loaded_log_key ~= next_cover_key then
      msg.info("StreamNyaa loading cover metadata ready.")
      ui.cover_loaded_log_key = next_cover_key
    end
  end
end

function ensure_cover_overlay()
  if mp.get_time() < cover_overlay_retry_at then return false end
  if not ENABLE_COVER_BITMAP_OVERLAY then
    clear_cover_overlay()
    debug_cover("cover bitmap overlay disabled; using mandatory ASS fallback")
    return false
  end
  local cover_path, cover_w, cover_h, cover_kind = active_cover_metadata()
  if cover_path == "" or cover_w <= 0 or cover_h <= 0 then
    clear_cover_overlay()
    debug_cover("fallback loading screen: no cover metadata")
    return false
  end

  local key = cover_kind .. ":" .. cover_path .. ":" .. tostring(cover_w) .. "x" .. tostring(cover_h)
  if cover_overlay and cover_overlay_key == key then
    return true
  end

  clear_cover_overlay()
  local info = utils.file_info(cover_path)
  if not info or not info.size or info.size == 0 then
    if ui.cover_missing_log_key ~= key then
      msg.warn("StreamNyaa loading cover file is not ready yet.")
      ui.cover_missing_log_key = key
    end
    debug_cover("cover file missing: " .. cover_path)
    return false
  end
  local expected_bytes = cover_w * cover_h * 4
  if info.size ~= expected_bytes then
    msg.warn(
      string.format(
        "StreamNyaa loading cover has invalid BGRA size: got %d bytes, expected %d.",
        info.size,
        expected_bytes
      )
    )
    debug_cover("invalid cover bytes: " .. cover_path)
    return false
  end

  -- MPV's osd-overlay API only supports ASS, not BGRA. Bitmap artwork uses
  -- overlay-add with an on-disk file and explicit display dimensions instead.
  cover_overlay = { path = cover_path, w = cover_w, h = cover_h, render_key = "" }
  cover_overlay_key = key
  if ui.cover_loaded_log_key ~= key then
    msg.info("StreamNyaa loading cover overlay loaded.")
    ui.cover_loaded_log_key = key
  end
  debug_cover("cover overlay loaded kind=" .. cover_kind .. " bytes=" .. tostring(info.size))
  return true
end

function update_cover_overlay(show, width, height, s)
  if not show or is_cover_loading_media() or ui.recovery_terminal then
    clear_cover_overlay()
    return nil
  end

  if not ensure_cover_overlay() then
    return nil
  end

  local cover_path, cover_w, cover_h, cover_kind = active_cover_metadata()
  if cover_path == "" or cover_w <= 0 or cover_h <= 0 then
    return nil
  end
  local render_key = tostring(width) .. "x" .. tostring(height)
  if cover_overlay.render_key == render_key then
    return { x = 0, y = 0, w = width, h = height, kind = cover_kind }
  end
  local ok, result, err = pcall(mp.command_native, {
    "overlay-add", 3, 0, 0, cover_path, 0, "bgra", cover_w, cover_h, cover_w * 4,
    math.floor(width), math.floor(height)
  })
  -- Commands without a return value (including overlay-add) succeed with nil.
  -- Only an exception or the second error return indicates failure.
  if not ok or err ~= nil then
    msg.warn("StreamNyaa cover overlay update failed: " .. tostring(ok and err or result))
    -- Video output can be briefly unavailable during loadfile/window changes.
    -- Retry after it settles instead of disabling artwork for this whole player.
    cover_overlay_retry_at = mp.get_time() + 1
    clear_cover_overlay()
    return nil
  end
  cover_overlay.render_key = render_key
  return { x = 0, y = 0, w = width, h = height, kind = cover_kind }
end

function has_cover_metadata()
  return cover_metadata_key() ~= ""
end

function maybe_reload_loading_metadata()
  if has_cover_metadata() then return end
  local meta_file = tostring(script_options.meta_file or "")
  if meta_file == "" then return end
  local now = mp.get_time()
  if now - (ui.last_meta_poll_at or 0) < 0.75 then return end
  ui.last_meta_poll_at = now
  load_player_meta()
end

function track_label(track)
  if not track then return "Unknown" end
  local title = track.title or track["external-filename"] or ""
  local lang = track.lang or ""
  local codec = track.codec or ""
  local parts = {}
  if title ~= "" then parts[#parts + 1] = tostring(title) end
  if lang ~= "" then parts[#parts + 1] = tostring(lang):upper() end
  if codec ~= "" then parts[#parts + 1] = tostring(codec) end
  if #parts == 0 then
    if track.type == "sub" then
      parts[#parts + 1] = string.format("Subtitle Track %s", tostring(track.id or ""))
    elseif track.type == "audio" then
      parts[#parts + 1] = string.format("Audio Track %s", tostring(track.id or ""))
    else
      parts[#parts + 1] = string.format("Track %s", tostring(track.id or ""))
    end
  end
  return table.concat(parts, " - ")
end

function refresh_track_cache(tracks)
  local list = tracks or state.tracks or {}
  cached_subtitle_tracks = {}
  cached_audio_tracks = {}
  for _, track in ipairs(list) do
    if track and track.id ~= nil then
      if track.type == "sub" then
        cached_subtitle_tracks[#cached_subtitle_tracks + 1] = track
      elseif track.type == "audio" then
        cached_audio_tracks[#cached_audio_tracks + 1] = track
      end
    end
  end
  track_cache_generation = track_cache_generation + 1
  ui.subtitle_menu_scroll = 0
  mark_menus_dirty("main", "subs", "audio")
end

function tracks_by_type(kind)
  if kind == "sub" then
    return cached_subtitle_tracks
  elseif kind == "audio" then
    return cached_audio_tracks
  end
  return {}
end

function current_track_label(kind, off_label)
  if kind == "sub" and (state.sid == "no" or not state.sub_visible) then return off_label or "Off" end
  local prop = kind == "audio" and state.aid or state.sid
  for _, track in ipairs(tracks_by_type(kind)) do
    if tostring(track.id) == tostring(prop) or track.selected then
      return ellipsize(track_label(track), 28)
    end
  end
  return off_label or "Auto"
end

local settings_notice

function format_sub_delay(value)
  local delay = tonumber(value) or 0
  if math.abs(delay) < 0.005 then return "0.0s" end
  return string.format("%+.1fs", delay)
end

function format_audio_delay(value)
  local delay = tonumber(value) or 0
  if math.abs(delay) < 0.005 then return "0.0s" end
  return string.format("%+.1fs", delay)
end

function video_aspect_label(value)
  value = tostring(value or state.video_aspect or "default")
  for _, option in ipairs(VIDEO_ASPECT_OPTIONS) do
    if option.value == value or option.property == value then return option.label end
  end
  if value == "-1" or value == "no" or value == "" then return "Default" end
  local ratio = tonumber(value)
  if ratio then
    if math.abs(ratio - (16 / 9)) < 0.02 then return "16:9" end
    if math.abs(ratio - (4 / 3)) < 0.02 then return "4:3" end
    if math.abs(ratio - (21 / 9)) < 0.03 then return "21:9" end
  end
  return value
end

function video_zoom_label(value)
  local zoom = tonumber(value or state.video_zoom) or 0
  if math.abs(zoom) < 0.005 then return "Fit" end
  return string.format("%+d%%", math.floor(zoom * 100 + (zoom >= 0 and 0.5 or -0.5)))
end

function loop_file_enabled(value)
  value = tostring(value or "")
  return value == "inf" or value == "yes" or value == "true" or value == "1"
end

function playback_summary()
  local parts = { speed_label() }
  if state.loop_file then parts[#parts + 1] = "Loop" end
  return table.concat(parts, " / ")
end

function apply_video_aspect(value)
  local selected = VIDEO_ASPECT_OPTIONS[1]
  for _, option in ipairs(VIDEO_ASPECT_OPTIONS) do
    if option.value == value then
      selected = option
      break
    end
  end
  if safe_set_property("video-aspect-override", selected.property) then
    state.video_aspect = selected.value
    settings_notice("Aspect ratio: " .. selected.label)
    return true
  end
  settings_notice("Aspect ratio is not supported by this MPV build")
  return false
end

function reset_video_zoom()
  local ok = true
  ok = safe_set_property_number("video-zoom", 0) and ok
  ok = safe_set_property_number("video-pan-x", 0) and ok
  ok = safe_set_property_number("video-pan-y", 0) and ok
  state.video_zoom = 0
  return ok
end

function apply_video_zoom(value)
  local current = tonumber(state.video_zoom) or 0
  local next_zoom = current
  if value == "fit" or value == "reset" then
    reset_video_zoom()
    settings_notice("Video zoom reset")
    return true
  elseif value == "fill" then
    next_zoom = 0.12
    safe_set_property_number("video-pan-x", 0)
    safe_set_property_number("video-pan-y", 0)
  elseif value == "in" then
    next_zoom = clamp(current + 0.10, -0.50, 0.50)
  elseif value == "out" then
    next_zoom = clamp(current - 0.10, -0.50, 0.50)
  end
  if safe_set_property_number("video-zoom", next_zoom) then
    state.video_zoom = next_zoom
    settings_notice("Video zoom: " .. video_zoom_label(next_zoom))
    return true
  end
  settings_notice("Video zoom is not supported by this MPV build")
  return false
end

function reset_playback_settings()
  safe_set_property_number("speed", 1)
  safe_set_property("loop-file", "no")
  safe_set_property_number("audio-delay", 0)
  state.speed = 1
  state.loop_file = false
  state.audio_delay = 0
  settings_notice("Playback settings reset")
end

function subtitle_style_choice(kind, value)
  for _, option in ipairs(SUBTITLE_STYLE_OPTIONS[kind] or {}) do
    if option.value == value then return option end
  end
  return (SUBTITLE_STYLE_OPTIONS[kind] or {})[1]
end

function subtitle_style_label(kind)
  local option = subtitle_style_choice(kind, state.subtitle_style[kind])
  return option and option.label or "Default"
end

function subtitle_style_summary()
  if not state.subtitle_style.custom then return "Default" end
  return subtitle_style_label("font_size") .. " / " .. subtitle_style_label("position")
end

function apply_subtitle_style()
  safe_set_property("sub-ass-override", state.subtitle_style.custom and "force" or "no")
  local applied = true
  for _, menu_item in ipairs(SUBTITLE_STYLE_MENU) do
    local option = subtitle_style_choice(menu_item.kind, state.subtitle_style[menu_item.kind])
    if option and option.properties then
      for property, value in pairs(option.properties) do
        if not safe_set_property(property, value) then
          applied = false
        end
      end
    end
  end
  return applied
end

function reset_subtitle_style()
  for key, value in pairs(SUBTITLE_STYLE_DEFAULT) do
    state.subtitle_style[key] = value
  end
  return apply_subtitle_style()
end

settings_notice = function(message)
  safe_commandv("show-text", message, "1700")
end

function player_setting_bool(value)
  local normalized = tostring(value or ""):lower()
  return normalized == "true" or normalized == "1" or normalized == "yes" or normalized == "on"
end

function emit_player_setting_changed(key, value)
  local setting_key = tostring(key or "")
  local setting_value = tostring(value or "")
  local request_file = tostring(script_options.settings_request_file or "")
  if request_file ~= "" and setting_key ~= "" then
    local file, error_message = io.open(request_file, "w")
    if file then
      file:write(setting_key .. "|" .. setting_value .. "|" .. tostring(mp.get_time()) .. "\n")
      file:close()
    else
      msg.warn("Could not write player setting request file: " .. tostring(error_message))
    end
  end
  safe_commandv("script-message", "streamnyaa-player-setting-changed", setting_key, setting_value)
end

function subtitle_style_preference_key(kind)
  local mapping = {
    font_size = "subtitleStyle.fontSize",
    position = "subtitleStyle.position",
    text_color = "subtitleStyle.textColor",
    outline = "subtitleStyle.outline",
    shadow = "subtitleStyle.shadow",
    background = "subtitleStyle.background",
  }
  return mapping[tostring(kind or "")]
end

function emit_subtitle_style_preferences()
  local style = state.subtitle_style or {}
  emit_player_setting_changed("subtitleStyle.fontSize", style.font_size or SUBTITLE_STYLE_DEFAULT.font_size)
  emit_player_setting_changed("subtitleStyle.position", style.position or SUBTITLE_STYLE_DEFAULT.position)
  emit_player_setting_changed("subtitleStyle.textColor", style.text_color or SUBTITLE_STYLE_DEFAULT.text_color)
  emit_player_setting_changed("subtitleStyle.outline", style.outline or SUBTITLE_STYLE_DEFAULT.outline)
  emit_player_setting_changed("subtitleStyle.shadow", style.shadow or SUBTITLE_STYLE_DEFAULT.shadow)
  emit_player_setting_changed("subtitleStyle.background", style.background or SUBTITLE_STYLE_DEFAULT.background)
  emit_player_setting_changed("subtitleStyle.custom", style.custom and "true" or "false")
end

function apply_player_preference(key, value)
  key = tostring(key or "")
  if key == "seekStepSeconds" then
    state.seek_step_seconds = math.floor(clamp(tonumber(value) or 10, 5, 60) / 5 + 0.5) * 5
    mark_menus_dirty("main", "seek_step")
  elseif key == "autoNextEpisode" or key == "auto_next_episode" then
    state.autoplay = player_setting_bool(value)
    mark_menu_dirty("main")
  elseif key == "autoSkipIntro" or key == "auto_skip_intro" then
    state.skip_intro = player_setting_bool(value)
    if not state.skip_intro then reset_skip_range_state() end
    mark_menu_dirty("main")
  elseif key == "autoSkipOutro" or key == "auto_skip_outro" then
    state.skip_outro = player_setting_bool(value)
    if not state.skip_outro then reset_skip_range_state() end
    mark_menu_dirty("main")
  elseif key == "rememberSpeed" or key == "remember_speed" then
    state.remember_speed = player_setting_bool(value)
    mark_menus_dirty("main", "playback")
  elseif key == "playbackSpeed" or key == "playback_speed" then
    local next_speed = clamp(tonumber(value) or state.speed or 1, 0.25, 4)
    state.speed = next_speed
    safe_set_property_number("speed", next_speed)
    mark_menus_dirty("main", "speed", "playback")
  elseif key == "volume" then
    local next_volume = clamp(tonumber(value) or state.volume or 100, 0, 130)
    state.volume = next_volume
    safe_set_property_number("volume", next_volume)
  elseif key == "muted" then
    state.muted = player_setting_bool(value)
    safe_set_property("mute", state.muted and "yes" or "no")
  elseif key == "subtitleStyle.fontSize" then
    state.subtitle_style.font_size = tostring(value or SUBTITLE_STYLE_DEFAULT.font_size)
    state.subtitle_style.custom = true
    apply_subtitle_style()
    mark_menus_dirty("main", "appearance", "appearance_font_size")
  elseif key == "subtitleStyle.position" then
    state.subtitle_style.position = tostring(value or SUBTITLE_STYLE_DEFAULT.position)
    state.subtitle_style.custom = true
    apply_subtitle_style()
    mark_menus_dirty("main", "appearance", "appearance_position")
  elseif key == "subtitleStyle.textColor" then
    state.subtitle_style.text_color = tostring(value or SUBTITLE_STYLE_DEFAULT.text_color)
    state.subtitle_style.custom = true
    apply_subtitle_style()
    mark_menus_dirty("main", "appearance", "appearance_text_color")
  elseif key == "subtitleStyle.outline" then
    state.subtitle_style.outline = tostring(value or SUBTITLE_STYLE_DEFAULT.outline)
    state.subtitle_style.custom = true
    apply_subtitle_style()
    mark_menus_dirty("main", "appearance", "appearance_outline")
  elseif key == "subtitleStyle.shadow" then
    state.subtitle_style.shadow = tostring(value or SUBTITLE_STYLE_DEFAULT.shadow)
    state.subtitle_style.custom = true
    apply_subtitle_style()
    mark_menus_dirty("main", "appearance", "appearance_shadow")
  elseif key == "subtitleStyle.background" then
    state.subtitle_style.background = tostring(value or SUBTITLE_STYLE_DEFAULT.background)
    state.subtitle_style.custom = true
    apply_subtitle_style()
    mark_menus_dirty("main", "appearance", "appearance_background")
  elseif key == "subtitleStyle.custom" then
    state.subtitle_style.custom = player_setting_bool(value)
    apply_subtitle_style()
    mark_menus_dirty("main", "appearance")
  else
    msg.warn("Unknown StreamNyaa player preference: " .. key)
    return false
  end
  draw(true, "player-preference")
  return true
end

function normalized_player_path()
  return tostring(state.path or ""):gsub("\\", "/"):lower()
end

function is_placeholder_path(value)
  local normalized = tostring(value or ""):gsub("\\", "/"):lower()
  return normalized:find("streamnyaa%-loading%.bmp") ~= nil
    or normalized:find("loading%-cover%.jpg") ~= nil
end

function is_generic_loading_media()
  return normalized_player_path():find("streamnyaa%-loading%.bmp") ~= nil
end

function is_cover_loading_media()
  return normalized_player_path():find("loading%-cover%.jpg") ~= nil
end

function is_placeholder_media()
  return is_generic_loading_media() or is_cover_loading_media()
end

function has_playable_media()
  return (tonumber(state.duration) or 0) > 0 and not is_placeholder_media()
end

function has_valid_playhead()
  return (tonumber(state.duration) or 0) > 0 and (tonumber(state.pos) or -1) >= 0
end

function is_midplayback_buffering()
  if ui.end_overlay then return false end
  if not state.has_started_playback then return false end
  if not has_playable_media() or not has_valid_playhead() then return false end
  if is_placeholder_media() or state.idle then return false end
  if ui.dragging == "seek" then return false end
  if state.paused and not state.paused_for_cache then return false end
  if state.paused_for_cache then return true end
  if state.cache_buffering_active then return true end
  if state.demuxer_underrun == true then return true end
  return ui.inferred_buffering == true or ui.playback_stalled == true
end

function load_persisted_player_preferences()
  local preferences_file = tostring(script_options.preferences_file or "")
  if preferences_file == "" then return false end
  local content = read_binary_file(preferences_file)
  if not content or content == "" then return false end
  local parsed = utils.parse_json(content)
  if type(parsed) ~= "table" then
    msg.warn("[StreamNyaa Lua] Could not parse persisted player preferences")
    return false
  end
  local ordered_keys = {
    "seekStepSeconds",
    "autoNextEpisode",
    "autoSkipIntro",
    "autoSkipOutro",
    "rememberSpeed",
    "playbackSpeed",
    "volume",
    "muted",
    "subtitleStyle.fontSize",
    "subtitleStyle.position",
    "subtitleStyle.textColor",
    "subtitleStyle.outline",
    "subtitleStyle.shadow",
    "subtitleStyle.background",
    "subtitleStyle.custom",
  }
  local applied = 0
  for _, key in ipairs(ordered_keys) do
    if parsed[key] ~= nil and apply_player_preference(key, parsed[key]) then
      applied = applied + 1
    end
  end
  msg.info("[StreamNyaa Lua] Loaded " .. tostring(applied) .. " persisted player preferences")
  return applied > 0
end

function is_buffering()
  return is_midplayback_buffering()
end

function is_loading()
  if is_midplayback_buffering() then return false end
  if has_playable_media() and state.has_started_playback and not ui.recovery_terminal then return false end
  if ui.recovery_terminal or (ui.recovery_attempt and state.idle) then return true end
  if state.paused_for_cache and not has_playable_media() then return true end
  if is_placeholder_media() then return true end
  if ui.loading_override_until and mp.get_time() < ui.loading_override_until then return true end
  if has_playable_media() and state.has_started_playback then return false end
  if state.idle or state.core_idle then return true end
  return not state.has_started_playback
end

function stream_progress()
  local cache = clamp(tonumber(state.cache_percent) or 0, 0, 100)
  if cache > 0 then return cache end
  if (tonumber(state.duration) or 0) > 0 and (tonumber(state.cache_end) or 0) > 0 then
    return clamp((state.cache_end / state.duration) * 100, 0, 100)
  end
  return 0
end

function clean_buffering_percent(percent)
  local value = tonumber(percent)
  if not value or value ~= value or value < 0 or value > 100 then return nil end
  return math.floor(clamp(value, 0, 100) + 0.5)
end

function hold_cover_for_first_video_frame()
  return has_playable_media()
    and not is_placeholder_media()
    and state.has_started_playback
    and mp.get_time() < (ui.first_video_frame_cover_until or 0)
end

function begin_first_video_frame_handoff()
  -- playback-restart follows the decoder handoff. A timed cover here paints
  -- artwork over the first video frames and can survive an idle redraw.
  ui.first_video_frame_cover_until = 0
  clear_cover_overlay()
end

function adaptive_buffer_target_seconds()
  if (ui.source_recovery_count or 0) >= 2 then return BUFFER_STRESSED_TARGET_SECONDS end
  if (ui.source_recovery_count or 0) >= 1 or ui.playback_stalled or ui.inferred_buffering then
    return BUFFER_RECOVERY_TARGET_SECONDS
  end
  return BUFFER_TARGET_SECONDS
end

function apply_adaptive_buffer_target()
  local target = adaptive_buffer_target_seconds()
  if ui.adaptive_buffer_target == target then return target end
  ui.adaptive_buffer_target = target
  safe_set_property_number("cache-secs", target)
  safe_set_property_number("demuxer-readahead-secs", math.max(45, target * 2))
  safe_set_property_number("user-data/streamnyaa/buffer_target_seconds", target)
  msg.info(string.format("[StreamNyaa Lua] Adaptive buffer target set to %ds", target))
  return target
end

function buffering_display_percent()
  local cache_percent = (state.paused_for_cache or state.cache_buffering_active) and clean_buffering_percent(state.cache_buffering_percent) or nil
  if cache_percent ~= nil then return cache_percent end
  local demuxer_percent = state.demuxer_underrun and clean_buffering_percent(state.demuxer_buffering_percent) or nil
  if demuxer_percent then return demuxer_percent end
  local cached = buffered_seconds()
  if cached ~= nil then
    return math.floor(clamp((cached / apply_adaptive_buffer_target()) * 100, 0, 100) + 0.5)
  end
  return nil
end

function buffered_seconds()
  local seconds = tonumber(state.demuxer_cache_duration)
  if seconds and seconds >= 0 then return seconds end
  seconds = tonumber(state.demuxer_state_duration)
  if seconds and seconds >= 0 then return seconds end
  local cache_end = tonumber(state.cache_end) or 0
  local pos = tonumber(state.pos) or 0
  if cache_end > pos then return cache_end - pos end
  return nil
end

function buffering_status_label()
  local percent = buffering_display_percent()
  if ui.playback_stalled then
    return percent and string.format("Reconnecting  ·  %d%%", percent) or "Reconnecting"
  end
  return percent and string.format("Buffering  ·  %d%%", percent) or "Connecting"
end

function log_buffering_transition()
  local active = is_midplayback_buffering()
  local percent = buffering_display_percent()
  if active ~= ui.last_buffering_active then
    if active then
      msg.info(string.format("[StreamNyaa Lua] Buffering started percent=%s", percent and tostring(percent) or "unknown"))
    else
      msg.info("[StreamNyaa Lua] Buffering ended")
    end
    ui.last_buffering_active = active
    ui.last_buffering_percent = percent
  elseif active and percent and percent ~= ui.last_buffering_percent then
    ui.last_buffering_percent = percent
  end
end

function reset_buffering_state()
  state.cache_percent = 0
  state.cache_buffering_percent = nil
  state.cache_buffering_active = false
  state.demuxer_buffering_percent = nil
  state.demuxer_cache_duration = nil
  state.demuxer_state_duration = nil
  state.demuxer_underrun = false
  state.cache_end = 0
  ui.last_buffering_active = false
  ui.last_buffering_percent = nil
end

function reset_stall_watchdog(keep_position)
  ui.inferred_buffering = false
  ui.playback_stalled = false
  ui.stall_actions_visible = false
  ui.stall_started_at = 0
  ui.stall_recovery_attempted = false
  ui.stall_recovery_at = 0
  ui.stall_backup_requested = false
  ui.stall_backup_at = 0
  ui.stall_ignore_restart_until = 0
  ui.stall_last_progress_at = mp.get_time()
  ui.stall_last_pos = keep_position and (tonumber(state.pos) or 0) or nil
  ui.stall_last_buffer = buffered_seconds()
  safe_set_property("user-data/streamnyaa/recovery_stage", native_buffering_active() and "buffering" or "idle")
end

function reset_startup_stream_watchdog(clear_key)
  if clear_key then ui.startup_stream_key = "" end
  ui.startup_stream_started_at = 0
  ui.startup_stream_retry_at = 0
  ui.startup_stream_retried = false
  ui.startup_stream_backup_at = 0
  ui.startup_stream_backup_requested = false
  ui.startup_stream_actions_visible = false
end

function begin_startup_stream_watchdog(path)
  local key = tostring(path or "")
  if key == "" or is_placeholder_path(key) then
    reset_startup_stream_watchdog(true)
    return
  end
  if ui.startup_stream_key ~= key then
    reset_startup_stream_watchdog(false)
    ui.startup_stream_key = key
    ui.startup_stream_started_at = mp.get_time()
    msg.info("[StreamNyaa Lua] Startup stream watchdog armed")
  elseif ui.startup_stream_started_at <= 0 then
    ui.startup_stream_started_at = mp.get_time()
  end
end

function check_startup_stream_stall()
  if check_recovery_deadline() then return end
  local path = tostring(state.path or "")
  if path == "" or is_placeholder_media() then
    return
  end
  if state.has_started_playback and has_playable_media() and has_valid_playhead() then
    reset_startup_stream_watchdog(true)
    return
  end
  if state.paused and not state.paused_for_cache then return end
  begin_startup_stream_watchdog(path)
  local now = mp.get_time()
  local waiting_for = now - (ui.startup_stream_started_at or now)
  if waiting_for < STARTUP_STREAM_RETRY_SECONDS then return end

  ui.inferred_buffering = true
  if not ui.startup_stream_retried then
    ui.startup_stream_retried = true
    ui.startup_stream_retry_at = now
    safe_set_property("user-data/streamnyaa/recovery_stage", "startup-retry")
    msg.info("[StreamNyaa Lua] Startup stream did not expose a playable timeline; reopening current stream")
    request_same_source_recovery("startup")
  end
  show_overlay()
  draw(false, "startup-stream-watchdog")
end

function native_buffering_active()
  return state.paused_for_cache == true or state.cache_buffering_active == true or state.demuxer_underrun == true
end

function stall_watchdog_allowed()
  if (state.paused and not state.paused_for_cache) or state.seeking or state.idle or ui.end_overlay then return false end
  if ui.dragging or is_placeholder_media() then return false end
  if not state.has_started_playback or not has_playable_media() or not has_valid_playhead() then return false end
  local duration = tonumber(state.duration) or 0
  local pos = tonumber(state.pos) or 0
  if duration <= 0 or pos < 0 or duration - pos <= 1.0 then return false end
  return true
end

function request_same_source_recovery(origin)
  local path = tostring(state.path or "")
  if path == "" or is_placeholder_path(path) then path = ui.last_video_path end
  local pos = ui.recovery_attempt and ui.recovery_attempt.position
    or (has_playable_media() and tonumber(state.pos)) or ui.last_video_position or 0
  if path == "" or is_placeholder_path(path) then return false end
  ui.recovery_terminal = false
  ui.recovery_attempt = { path = path, position = pos, started_at = mp.get_time(), kind = origin == "startup" and "startup" or "retry", restart_seen = false }
  ui.stall_recovery_attempted = true
  ui.source_recovery_count = ui.source_recovery_count + 1
  apply_adaptive_buffer_target()
  ui.stall_recovery_at = mp.get_time()
  ui.stall_actions_visible = false
  ui.stall_ignore_restart_until = ui.stall_recovery_at + 3
  safe_set_property("user-data/streamnyaa/recovery_stage", "retrying")
  msg.info(string.format("[StreamNyaa Lua] Same-source stream reopen origin=%s position=%.2f", tostring(origin or "watchdog"), pos))
  ui.recovery_restore = {
    sid = state.sid,
    aid = state.aid,
    speed = state.speed,
    volume = state.volume,
    muted = state.muted,
    sub_visible = state.sub_visible,
    sub_delay = state.sub_delay,
    audio_delay = state.audio_delay,
  }
  if script_options.stall_test_mode then return true end
  return safe_commandv("loadfile", path, "replace", "-1", string.format("start=%.3f", pos))
end

function request_software_decoder_recovery()
  local path = tostring(state.path or "")
  local media_key = current_media_key()
  local pos = tonumber(state.pos) or 0
  if path == "" or media_key == "" or is_placeholder_media() then return false end
  if ui.software_decoder_media == media_key then return false end
  ui.software_decoder_media = media_key
  ui.recovery_attempt = { path = path, position = pos, started_at = mp.get_time(), kind = "decoder", restart_seen = false }
  ui.recovery_terminal = false
  ui.recovery_restore = {
    sid = state.sid,
    aid = state.aid,
    speed = state.speed,
    volume = state.volume,
    muted = state.muted,
    sub_visible = state.sub_visible,
    sub_delay = state.sub_delay,
    audio_delay = state.audio_delay,
  }
  safe_set_property("hwdec", "no")
  safe_set_property("user-data/streamnyaa/recovery_stage", "decoder-retry")
  msg.info(string.format("[StreamNyaa Lua] Retrying healthy-buffer playback with software decoding at %.2f", pos))
  return safe_commandv("loadfile", path, "replace", "-1", string.format("start=%.3f", pos))
end

function restore_same_source_preferences()
  local restore = ui.recovery_restore
  if not restore then return end
  ui.recovery_restore = nil
  if restore.sid ~= nil then safe_set_property("sid", restore.sid) end
  if restore.aid ~= nil then safe_set_property("aid", restore.aid) end
  safe_set_property_number("speed", tonumber(restore.speed) or 1)
  safe_set_property_number("volume", tonumber(restore.volume) or 100)
  safe_set_property_bool("mute", restore.muted == true)
  safe_set_property_bool("sub-visibility", restore.sub_visible ~= false)
  safe_set_property_number("sub-delay", tonumber(restore.sub_delay) or 0)
  safe_set_property_number("audio-delay", tonumber(restore.audio_delay) or 0)
  msg.info("[StreamNyaa Lua] Restored player preferences after same-source recovery")
end

function request_backup_source_recovery(action)
  if ui.recovery_attempt and ui.recovery_attempt.kind == "backup" then return end
  local pos = ui.recovery_attempt and ui.recovery_attempt.position
    or (has_playable_media() and tonumber(state.pos)) or ui.last_video_position or 0
  local key = current_media_key()
  msg.info(string.format("[StreamNyaa Lua] Backup recovery requested key=%s position=%.2f", tostring(key), pos))
  ui.stall_backup_requested = true
  ui.stall_backup_at = mp.get_time()
  ui.recovery_terminal = false
  ui.recovery_attempt = { path = ui.last_video_path ~= "" and ui.last_video_path or state.path, position = pos, started_at = mp.get_time(), kind = "backup", restart_seen = false }
  safe_set_property("user-data/streamnyaa/recovery_stage", "switching")
  safe_commandv("script-message", "streamnyaa-player-recovery-request", action == "retry" and "retry" or "backup", tostring(key), tostring(pos))
end

function check_recovery_deadline()
  if ui.recovery_terminal then return true end
  local attempt = ui.recovery_attempt
  if not attempt then return false end
  local now = mp.get_time()
  local tick = math.max(0, now - (attempt.last_check_at or now))
  attempt.last_check_at = now
  if state.paused and not state.paused_for_cache then
    attempt.started_at = attempt.started_at + tick
    return true
  end
  local elapsed = now - attempt.started_at
  if attempt.kind == "backup" then
    if elapsed >= STALL_BACKUP_WAIT_SECONDS then
      ui.recovery_terminal = true
      ui.stall_actions_visible = true
      ui.startup_stream_actions_visible = true
      ui.playback_stalled = true
      safe_set_property("user-data/streamnyaa/recovery_stage", "failed")
      msg.warn("[StreamNyaa Lua] Recovery deadline exhausted; stopped loading animation")
      show_overlay()
      draw(true, "recovery-exhausted")
    end
  elseif elapsed >= (attempt.kind == "startup" and STARTUP_STREAM_BACKUP_SECONDS or STALL_ACTION_SECONDS) then
    msg.warn(attempt.kind == "startup"
      and "[StreamNyaa Lua] Startup stream retry did not become playable; requesting backup"
      or "[StreamNyaa Lua] Recovery produced no advancing video; requesting backup")
    request_backup_source_recovery()
  end
  return true
end

function check_playback_stall()
  local now = mp.get_time()
  local pos = tonumber(state.pos) or 0
  if check_recovery_deadline() then return end
  if not stall_watchdog_allowed() then
    if stall_watchdog_timer then stall_watchdog_timer:stop() end
    reset_stall_watchdog(true)
    return
  end

  local cached = buffered_seconds()
  if ui.stall_last_pos == nil then
    ui.stall_last_pos = pos
    ui.stall_last_buffer = cached
    ui.stall_last_progress_at = now
    return
  end

  local playhead_advanced = math.abs(pos - ui.stall_last_pos) >= 0.15
  local buffer_advanced = cached ~= nil and (ui.stall_last_buffer == nil or cached > ui.stall_last_buffer + 0.20)
  if playhead_advanced then
    ui.playhead_last_advance_at = now
  end
  local continuous_wait = now - (ui.playhead_last_advance_at or now)
  if not playhead_advanced and is_midplayback_buffering() and continuous_wait >= MAX_CONTINUOUS_BUFFERING_SECONDS then
    msg.warn("[StreamNyaa Lua] Continuous buffering deadline reached despite intermittent data")
    request_same_source_recovery("continuous-buffering")
    return
  end
  if playhead_advanced or buffer_advanced then
    if ui.inferred_buffering or ui.playback_stalled then
      msg.info("[StreamNyaa Lua] Playback or buffer resumed after stall")
    end
    reset_stall_watchdog(true)
    ui.stall_last_pos = pos
    ui.stall_last_buffer = cached
    return
  end

  local frozen_for = now - (ui.stall_last_progress_at or now)
  if frozen_for < STALL_DETECT_SECONDS then return end
  if ui.stall_started_at <= 0 then
    ui.stall_started_at = now - frozen_for
    ui.anim_started = now
    if cached == nil or cached < STALL_LOW_BUFFER_SECONDS then
      ui.inferred_buffering = true
      ui.playback_stalled = false
      msg.info(string.format("[StreamNyaa Lua] Undeclared low-buffer stall detected cached=%s", cached and string.format("%.1f", cached) or "unknown"))
    else
      ui.inferred_buffering = false
      ui.playback_stalled = true
      msg.info(string.format("[StreamNyaa Lua] Playback stalled with healthy buffer cached=%.1f", cached))
    end
    show_overlay()
  end

  local stalled_for = now - ui.stall_started_at
  if not script_options.stall_test_mode and stalled_for >= 6 and cached ~= nil and cached >= STALL_LOW_BUFFER_SECONDS and ui.software_decoder_media ~= current_media_key() then
    if request_software_decoder_recovery() then return end
  end
  if stalled_for >= STALL_RECOVERY_SECONDS and not ui.stall_recovery_attempted then
    if ui.source_recovery_count < 1 then
      request_same_source_recovery("watchdog")
    else
      request_backup_source_recovery()
      ui.stall_recovery_attempted = true
      ui.stall_recovery_at = now
    end
  end
  draw(false, "stall-watchdog")
end

function update_stall_watchdog_timer()
  if not stall_watchdog_timer then return end
  if stall_watchdog_allowed() then
    stall_watchdog_timer:resume()
  else
    stall_watchdog_timer:stop()
    reset_stall_watchdog(true)
    if state.paused and not state.paused_for_cache or state.seeking or ui.dragging then
      ui.playhead_last_advance_at = mp.get_time()
    end
  end
end

function stream_status_label()
  if state.paused_for_cache then return "Buffering" end
  if is_placeholder_media() or state.core_idle or state.idle or (tonumber(state.duration) or 0) <= 0 then return "Preparing" end
  if is_buffering() then return "Buffering" end
  return "Ready"
end

function normalized_chapter_title(chapter)
  local title = ""
  if type(chapter) == "table" then
    title = chapter.title or chapter.name or ""
  end
  title = tostring(title or ""):lower()
  title = title:gsub("[%[%]%(%){}%-%_%./\\:;]+", " ")
  title = title:gsub("%s+", " ")
  return " " .. title .. " "
end

function is_intro_chapter(chapter)
  local title = normalized_chapter_title(chapter)
  if title:find(" ending ", 1, true)
    or title:find(" outro ", 1, true)
    or title:find(" ed ", 1, true)
    or title:find(" preview ", 1, true)
    or title:find(" next episode ", 1, true) then
    return false
  end
  return title:find(" intro ", 1, true) ~= nil
    or title:find(" opening ", 1, true) ~= nil
    or title:find(" opening theme ", 1, true) ~= nil
    or title:find(" opening song ", 1, true) ~= nil
    or title:find(" op ", 1, true) ~= nil
    or title:find(" ncop ", 1, true) ~= nil
    or title:find(" creditless op ", 1, true) ~= nil
    or title:find(" opening credits ", 1, true) ~= nil
    or title:find(" op %d+ ") ~= nil
    or title:find(" op%d+ ") ~= nil
end

function is_outro_chapter(chapter)
  local title = normalized_chapter_title(chapter)
  if title:find(" preview ", 1, true)
    or title:find(" next episode ", 1, true)
    or title:find(" next ep ", 1, true)
    or title:find(" intro ", 1, true)
    or title:find(" opening ", 1, true)
    or title:find(" op ", 1, true)
    or title:find(" ncop ", 1, true)
    or title:find(" creditless op ", 1, true) then
    return false
  end
  return title:find(" ending ", 1, true) ~= nil
    or title:find(" ending theme ", 1, true) ~= nil
    or title:find(" ending song ", 1, true) ~= nil
    or title:find(" end credits ", 1, true) ~= nil
    or title:find(" outro ", 1, true) ~= nil
    or title:find(" ed ", 1, true) ~= nil
    or title:find(" nced ", 1, true) ~= nil
    or title:find(" creditless ed ", 1, true) ~= nil
    or title:find(" ending credits ", 1, true) ~= nil
    or title:find(" ed %d+ ") ~= nil
    or title:find(" ed%d+ ") ~= nil
end

function chapter_range_for_position(pos, allow_nearby, matcher, fallback_seconds, edge_tolerance)
  pos = tonumber(pos) or 0
  local chapters = state.chapters or {}
  local duration = tonumber(state.duration) or 0
  for index, chapter in ipairs(chapters) do
    local start_time = tonumber(chapter.time)
    if start_time and matcher and matcher(chapter) then
      local end_time = nil
      for next_index = index + 1, #chapters do
        local next_time = tonumber(chapters[next_index].time)
        if next_time and next_time > start_time + 3 then
          end_time = next_time
          break
        end
      end
      if not end_time then
        end_time = start_time + fallback_seconds
        if duration > 0 then end_time = math.min(end_time, duration - 0.1) end
      end
      local marker_length = end_time - start_time
      if marker_length >= 8 and marker_length <= 210 then
        local early = allow_nearby and 8 or 0
        if pos >= start_time - early and pos < end_time - edge_tolerance then
          return start_time, end_time
        end
      end
    end
  end
  return nil, nil
end

function intro_chapter_range_for_position(pos, allow_nearby)
  return chapter_range_for_position(pos, allow_nearby, is_intro_chapter, INTRO_SKIP_FALLBACK_SECONDS, INTRO_EDGE_TOLERANCE_SECONDS)
end

function outro_chapter_range_for_position(pos, allow_nearby)
  return chapter_range_for_position(pos, allow_nearby, is_outro_chapter, OUTRO_SKIP_FALLBACK_SECONDS, OUTRO_EDGE_TOLERANCE_SECONDS)
end

function normal_episode_duration()
  local duration = tonumber(state.duration) or 0
  return duration >= NORMAL_EPISODE_MIN_SECONDS and duration <= NORMAL_EPISODE_MAX_SECONDS
end

function high_confidence_fallback_duration()
  local duration = tonumber(state.duration) or 0
  return duration >= FALLBACK_HIGH_CONFIDENCE_MIN_SECONDS and duration <= FALLBACK_HIGH_CONFIDENCE_MAX_SECONDS
end

function skip_feature_duration_allowed()
  local duration = tonumber(state.duration) or 0
  return duration >= SKIP_FEATURE_MIN_SECONDS and duration <= SKIP_FEATURE_MAX_SECONDS
end

function has_matching_chapter(matcher)
  if not matcher then return false end
  for _, chapter in ipairs(state.chapters or {}) do
    if tonumber(chapter.time) and matcher(chapter) then return true end
  end
  return false
end

function valid_skip_range(start_time, end_time)
  local duration = tonumber(state.duration) or 0
  start_time = tonumber(start_time)
  end_time = tonumber(end_time)
  if not skip_feature_duration_allowed() then return false end
  if not start_time or not end_time then return false end
  if duration <= 0 then return false end
  if start_time < 0 or end_time <= start_time then return false end
  if end_time - start_time < 8 then return false end
  if start_time >= duration - 1 then return false end
  if end_time > duration + 1 then return false end
  return true
end

function skip_range_key(kind, start_time, end_time)
  return tostring(kind or "skip")
    .. ":"
    .. tostring(math.floor(tonumber(start_time) or 0))
    .. ":"
    .. tostring(math.floor(tonumber(end_time) or 0))
end

function skip_state_for(key)
  key = tostring(key or "")
  if key == "" then return nil end
  ui.skip_range_state[key] = ui.skip_range_state[key] or {}
  return ui.skip_range_state[key]
end

function reset_skip_range_state()
  ui.skip_intro_applied = false
  ui.skip_outro_applied = false
  ui.skip_range_state = {}
end

function explicit_skip_range(kind, pos, allow_nearby)
  local matcher = kind == "outro" and is_outro_chapter or is_intro_chapter
  local fallback = kind == "outro" and OUTRO_SKIP_FALLBACK_SECONDS or INTRO_SKIP_FALLBACK_SECONDS
  local tolerance = kind == "outro" and OUTRO_EDGE_TOLERANCE_SECONDS or INTRO_EDGE_TOLERANCE_SECONDS
  local start_time, end_time = chapter_range_for_position(pos, allow_nearby, matcher, fallback, tolerance)
  if not valid_skip_range(start_time, end_time) then return nil end
  return {
    kind = kind,
    start_time = start_time,
    end_time = end_time,
    source = "chapter",
    high_confidence = true,
    key = skip_range_key(kind, start_time, end_time),
  }
end

function fallback_skip_range(kind, pos, allow_nearby)
  local duration = tonumber(state.duration) or 0
  pos = tonumber(pos) or 0
  if not normal_episode_duration() then return nil end
  if kind == "intro" then
    if has_matching_chapter(is_intro_chapter) then return nil end
    local start_time = INTRO_FALLBACK_START_SECONDS
    local end_time = math.min(INTRO_FALLBACK_END_SECONDS, duration - 0.1)
    local nearby_end = math.min(INTRO_FALLBACK_NEARBY_END_SECONDS, duration - 0.1)
    local trigger_end = allow_nearby and nearby_end or (end_time - INTRO_EDGE_TOLERANCE_SECONDS)
    if pos < start_time or pos >= trigger_end then return nil end
    if not valid_skip_range(start_time, end_time) or end_time <= pos + 0.2 then return nil end
    return {
      kind = kind,
      start_time = start_time,
      end_time = end_time,
      source = "fallback_intro",
      high_confidence = high_confidence_fallback_duration(),
      key = skip_range_key(kind, start_time, end_time),
    }
  end

  if has_matching_chapter(is_outro_chapter) then return nil end
  if not high_confidence_fallback_duration() then return nil end
  local start_time = math.max(0, duration - OUTRO_FALLBACK_START_FROM_END_SECONDS)
  local end_time = math.max(start_time + 8, duration - OUTRO_FALLBACK_END_FROM_END_SECONDS)
  if pos < start_time or pos >= end_time - OUTRO_EDGE_TOLERANCE_SECONDS then return nil end
  if not valid_skip_range(start_time, end_time) or end_time <= pos + 0.2 then return nil end
  return {
      kind = kind,
      start_time = start_time,
      end_time = end_time,
      source = "fallback_outro",
      high_confidence = false,
      key = skip_range_key(kind, start_time, end_time),
    }
end

function skip_range_for_position(kind, pos, allow_nearby)
  -- False positives are worse than a missing skip. Only release-provided OP/ED
  -- chapters can drive buttons or automatic seeking.
  return explicit_skip_range(kind, pos, allow_nearby)
end

function position_inside_skip_range(range, pos)
  if not range then return false end
  pos = tonumber(pos)
  local start_time = tonumber(range.start_time)
  local end_time = tonumber(range.end_time)
  if not pos or not start_time or not end_time then return false end
  if not valid_skip_range(start_time, end_time) then return false end
  if pos < start_time or pos >= end_time then return false end
  if end_time <= pos + 0.2 then return false end
  return true
end

function manual_strict_skip_range(kind, pos)
  local range = skip_range_for_position(kind, pos, false)
  if not position_inside_skip_range(range, pos) then return nil end
  return range
end

function can_auto_skip_now(range)
  if not range then return false end
  if state.paused or is_loading() or is_buffering() then return false end
  if ui.dragging then return false end
  if ui.end_overlay then return false end
  if not valid_skip_range(range.start_time, range.end_time) then return false end
  local pos = tonumber(state.pos)
  local duration = tonumber(state.duration)
  if not pos or not duration or duration <= 0 then return false end
  if not position_inside_skip_range(range, pos) then return false end
  if range.end_time <= pos + 0.2 then return false end
  if range.end_time > duration + 1 then return false end
  if range.kind == "outro" and range.source ~= "chapter" then return false end
  if range.source ~= "chapter" and not range.high_confidence then return false end
  return true
end

function chapter_marker_end_at(index, fallback_seconds)
  local chapters = state.chapters or {}
  local chapter = chapters[index]
  local start_time = tonumber(chapter and chapter.time)
  if not start_time then return nil end
  local duration = tonumber(state.duration) or 0
  local end_time = nil
  for next_index = index + 1, #chapters do
    local next_time = tonumber(chapters[next_index].time)
    if next_time and next_time > start_time + 3 then
      end_time = next_time
      break
    end
  end
  if not end_time then
    end_time = start_time + (fallback_seconds or 90)
    if duration > 0 then end_time = math.min(end_time, duration - 0.1) end
  end
  if not end_time or end_time <= start_time then return nil end
  return end_time
end

function log_op_ed_markers()
  local chapters = state.chapters or {}
  local key = tostring(#chapters) .. ":" .. tostring(math.floor(tonumber(state.duration) or 0))
  if ui.marker_log_key == key then return end
  ui.marker_log_key = key

  local count = 0
  for index, chapter in ipairs(chapters) do
    local start_time = tonumber(chapter.time)
    if start_time and is_intro_chapter(chapter) then
      local end_time = chapter_marker_end_at(index, INTRO_SKIP_FALLBACK_SECONDS)
      count = count + 1
      msg.info(string.format("[StreamNyaa Lua] Opening marker: start=%.2f end=%.2f source=chapter", start_time, end_time or start_time))
    elseif start_time and is_outro_chapter(chapter) then
      local end_time = chapter_marker_end_at(index, OUTRO_SKIP_FALLBACK_SECONDS)
      count = count + 1
      msg.info(string.format("[StreamNyaa Lua] Ending marker: start=%.2f end=%.2f source=chapter", start_time, end_time or start_time))
    end
  end

  if count > 0 then
    msg.info("[StreamNyaa Lua] OP/ED markers loaded: " .. tostring(count))
  else
    msg.info("[StreamNyaa Lua] No OP/ED markers found; generic seekbar markers disabled")
  end
end

function show_overlay()
  ui.visible = true
  ui.last_interaction = mp.get_time()
end

function note_direct_interaction()
  ui.last_direct_interaction = mp.get_time()
end

function current_media_key()
  local path = tostring(state.path or "")
  local title = tostring(state.title or state.filename or "")
  local duration = math.floor(tonumber(state.duration) or 0)
  return table.concat({ path, title, tostring(duration) }, "|")
end

function reset_end_overlay_state()
  ui.end_overlay = false
  ui.end_overlay_key = ""
  ui.end_next_pending = false
  ui.end_request_id = ""
  ui.end_status = "idle"
  ui.end_focus = "end_next_episode"
  ui.eof_handled_key = ""
  ui.last_next_episode_request_key = ""
end

function emit_next_request(reason, request_id)
  local request_file = tostring(script_options.next_episode_request_file or "")
  if request_file ~= "" then
    local file = io.open(request_file, "w")
    if file then
      file:write(reason .. "|" .. request_id .. "\n")
      file:close()
    end
  end
  safe_commandv("script-message", "streamnyaa-next-episode-request", reason, request_id)
end

function hide_end_overlay(cancel_pending)
  if cancel_pending and ui.end_request_id ~= "" then emit_next_request("cancel", ui.end_request_id) end
  ui.end_overlay = false
  ui.end_overlay_key = ""
  ui.end_next_pending = false
  ui.end_request_id = ""
  ui.end_status = "idle"
end

function scaled(width, height)
  return clamp(math.min(width / 1920, height / 1080), 0.72, 2.0)
end

local PLAYER_UI = { icon = 24, hit = 44, center_hit = 64, center_icon = 28, margin = 24, gap = 8 }
function controls_scale(s)
  -- MPV may return (default, error) when no display property is available.
  -- Capture one value; forwarding both results to math.max kills the UI script.
  local display_scale = mp.get_property_number("display-hidpi-scale", 1)
  return clamp(math.max(tonumber(s) or 1, tonumber(display_scale) or 1), 1, 2)
end

function draw_gradient_top(ass, width, height, s)
  -- Intentionally transparent. No full-width OSD backplate.
end

function request_external_subtitle_import()
  local request_file = tostring(script_options.subtitle_request_file or "")
  if request_file ~= "" then
    local file, error_message = io.open(request_file, "w")
    if file then
      file:write(tostring(mp.get_time()) .. "\n")
      file:close()
      msg.info("Wrote external subtitle import request: " .. request_file)
    else
      msg.warn("Could not write subtitle import request file: " .. tostring(error_message))
    end
  else
    msg.warn("Subtitle import request file is not configured; using MPV script-message only")
  end

  safe_commandv("script-message", "streamnyaa-import-subtitle-request")
end

function request_next_episode(reason)
  if reason == "ended" and ui.sleep_expired then return end
  if ui.end_next_pending or ui.end_status == "unavailable" then return end
  local next_reason = reason == "ended" and "ended" or "manual"
  local key = current_media_key()
  local request_key = next_reason .. ":" .. key
  if next_reason == "ended" and request_key == ui.last_next_episode_request_key then return end
  ui.last_next_episode_request_key = next_reason == "ended" and request_key or ""
  ui.end_next_request_token = (ui.end_next_request_token or 0) + 1
  ui.end_request_id = string.format("next-%d-%d", math.floor(mp.get_time() * 1000), ui.end_next_request_token)
  ui.end_next_pending = next_reason == "manual" or state.autoplay
  ui.end_status = ui.end_next_pending and "preparing" or "idle"
  ui.end_request_deadline = ui.end_next_pending and (mp.get_time() + 30) or nil
  safe_set_property("user-data/streamnyaa/next-enabled", state.autoplay and "true" or "false")
  emit_next_request(next_reason, ui.end_request_id)
end

mp.register_script_message("streamnyaa-next-episode-status", function(request_id, status)
  if tostring(request_id or "") ~= ui.end_request_id or ui.end_request_id == "" then return end
  if status ~= "preparing" and status ~= "opening" and status ~= "unavailable" and status ~= "failed" and status ~= "idle" then return end
  ui.end_status = status
  ui.end_request_deadline = (status == "preparing" or status == "opening") and (mp.get_time() + 30) or nil
  ui.end_next_pending = status == "preparing" or status == "opening"
  if status == "unavailable" then ui.end_focus = "end_replay" end
  draw(true, "next-episode-status")
end)

function handle_episode_eof()
  local key = tostring(ui.eof_candidate_key or "")
  if key == "" or ui.eof_handled_key == key then return end
  ui.eof_handled_key = key
  ui.eof_candidate_key = ""
  show_overlay()
  msg.info("[StreamNyaa Lua] EOF normal; sending next request reason=ended key=" .. tostring(key))
  msg.info("[StreamNyaa Lua] EOF reached; showing fail-safe end overlay")
  ui.end_overlay = true
  ui.end_overlay_key = key
  request_next_episode("ended")
end

function maybe_handle_episode_end()
  if ui.end_overlay or ui.dragging == "seek" then return end
  if is_loading() or is_buffering() or state.paused then return end
  if not state.has_started_playback or not has_playable_media() then return end
  local duration = tonumber(state.duration) or 0
  local pos = tonumber(state.pos) or 0
  if duration < 60 or pos < 0 or pos / duration < 0.98 then return end
  if duration - pos > 0.45 then return end
  ui.eof_candidate_key = current_media_key()
  msg.info("[StreamNyaa Lua] Near-EOF fallback reached; preparing next-episode flow")
  handle_episode_eof()
end

function draw_gradient_bottom(ass, width, height, s)
  -- Intentionally transparent. Never paint stepped horizontal bands over video.
end

function icon_point(cx, cy, size, x, y)
  local scale = size / 24
  return cx + (x - 12) * scale, cy + (y - 12) * scale
end

function icon_stroke(size, weight)
  return math.max(1.55, size * (weight or 0.085))
end

function icon_line(ass, cx, cy, size, x1, y1, x2, y2, color, thickness, caps)
  local ax, ay = icon_point(cx, cy, size, x1, y1)
  local bx, by = icon_point(cx, cy, size, x2, y2)
  local t = thickness or icon_stroke(size)
  line(ass, ax, ay, bx, by, t, color, 0)
  if caps ~= false then
    circle(ass, ax, ay, t / 2, color, 0)
    circle(ass, bx, by, t / 2, color, 0)
  end
end

function icon_polyline(ass, cx, cy, size, points, color, thickness)
  for i = 1, #points - 1 do
    icon_line(ass, cx, cy, size, points[i][1], points[i][2], points[i + 1][1], points[i + 1][2], color, thickness)
  end
end

function icon_rect_outline(ass, cx, cy, size, x1, y1, x2, y2, color, thickness)
  local t = thickness or icon_stroke(size)
  icon_line(ass, cx, cy, size, x1, y1, x2, y1, color, t)
  icon_line(ass, cx, cy, size, x2, y1, x2, y2, color, t)
  icon_line(ass, cx, cy, size, x2, y2, x1, y2, color, t)
  icon_line(ass, cx, cy, size, x1, y2, x1, y1, color, t)
end

function rounded_outline(ass, x1, y1, x2, y2, radius, thickness, color, alpha)
  radius = math.max(0, math.min(radius or 0, (x2 - x1) / 2, (y2 - y1) / 2))
  thickness = thickness or 2
  line(ass, x1 + radius, y1, x2 - radius, y1, thickness, color, alpha)
  line(ass, x2, y1 + radius, x2, y2 - radius, thickness, color, alpha)
  line(ass, x2 - radius, y2, x1 + radius, y2, thickness, color, alpha)
  line(ass, x1, y2 - radius, x1, y1 + radius, thickness, color, alpha)
  draw_arc(ass, x2 - radius, y1 + radius, radius, 0, 90, thickness, color, alpha or 0)
  draw_arc(ass, x2 - radius, y2 - radius, radius, 90, 90, thickness, color, alpha or 0)
  draw_arc(ass, x1 + radius, y2 - radius, radius, 180, 90, thickness, color, alpha or 0)
  draw_arc(ass, x1 + radius, y1 + radius, radius, 270, 90, thickness, color, alpha or 0)
end

function icon_ring(ass, cx, cy, size, x, y, radius, color, thickness)
  local px, py = icon_point(cx, cy, size, x, y)
  draw_arc(ass, px, py, radius * size / 24, 0, 360, thickness or icon_stroke(size), color, 0)
end

function icon_triangle(ass, cx, cy, size, points, color)
  local a1, b1 = icon_point(cx, cy, size, points[1][1], points[1][2])
  local a2, b2 = icon_point(cx, cy, size, points[2][1], points[2][2])
  local a3, b3 = icon_point(cx, cy, size, points[3][1], points[3][2])
  local commands = { string.format("m %.2f %.2f l %.2f %.2f l %.2f %.2f", a1, b1, a2, b2, a3, b3) }
  for i = 4, #points do
    local px, py = icon_point(cx, cy, size, points[i][1], points[i][2])
    commands[#commands + 1] = string.format("l %.2f %.2f", px, py)
  end
  path(ass, color, 0, table.concat(commands, " "))
end

function icon_play(ass, cx, cy, size, color)
  icon_triangle(ass, cx + size * 0.04, cy, size, {{8, 5.8}, {8, 18.2}, {18, 12}}, color)
end

function icon_pause(ass, cx, cy, size, color)
  local x1, y1 = icon_point(cx, cy, size, 6.8, 5.1)
  local x2, y2 = icon_point(cx, cy, size, 10.8, 18.9)
  rounded_rect(ass, x1, y1, x2, y2, size * 0.075, color, 0)
  x1, y1 = icon_point(cx, cy, size, 13.2, 5.1)
  x2, y2 = icon_point(cx, cy, size, 17.2, 18.9)
  rounded_rect(ass, x1, y1, x2, y2, size * 0.075, color, 0)
end

function icon_play_pause(ass, cx, cy, size, color)
  if state.paused or is_loading() then
    icon_play(ass, cx + size * 0.035, cy, size, color)
  else
    icon_pause(ass, cx, cy, size * 1.12, color)
  end
end

function seek_step_seconds()
  return state.seek_step_seconds or 10
end

function icon_skip(ass, cx, cy, size, color, forward)
  local t = icon_stroke(size, 0.075)
  draw_text(ass, cx, cy, 5, math.max(11, size * 0.48), color, 0, tostring(seek_step_seconds()), true, "Segoe UI Semibold")
  draw_arc(ass, cx, cy, size * 0.40, forward and -35 or 140, 255, t, color, 0)
  if forward then
    icon_polyline(ass, cx, cy, size, {{16.3, 5.3}, {19.1, 5.8}, {18.4, 8.8}}, color, t)
  else
    icon_polyline(ass, cx, cy, size, {{7.7, 5.3}, {4.9, 5.8}, {5.6, 8.8}}, color, t)
  end
end

function icon_volume(ass, cx, cy, size, color)
  icon_triangle(ass, cx, cy, size, {{4.2, 10}, {8.2, 10}, {13, 6}, {13, 18}, {8.2, 14}, {4.2, 14}}, color)
  if state.muted or state.volume <= 0 then
    icon_line(ass, cx, cy, size, 17, 9, 21, 15, color, icon_stroke(size, 0.08))
    icon_line(ass, cx, cy, size, 21, 9, 17, 15, color, icon_stroke(size, 0.08))
  else
    local wx, wy = icon_point(cx, cy, size, 13.4, 12)
    draw_arc(ass, wx, wy, size * 0.20, 35, 110, icon_stroke(size, 0.07), color, 0)
    if state.volume > 45 then
      draw_arc(ass, wx, wy, size * 0.33, 30, 120, icon_stroke(size, 0.07), color, 0)
    end
  end
end

function icon_cc(ass, cx, cy, size, color)
  local w = size * 1.08
  local h = size * 0.76
  local t = math.max(2.0, size * 0.072)
  local r = size * 0.18
  rounded_outline(ass, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r, t, color, 0)
  draw_text(ass, cx, cy + size * 0.08, 5, math.max(12, size * 0.43), color, 0, "CC", true, "Segoe UI Semibold")
end

function icon_typography(ass, cx, cy, size, color)
  draw_text(ass, cx - size * 0.08, cy + size * 0.13, 5, math.max(13, size * 0.58), color, 0, "A", true, "Segoe UI Semibold")
  draw_text(ass, cx + size * 0.23, cy + size * 0.16, 5, math.max(10, size * 0.42), color, 0, "a", true, "Segoe UI")
  icon_line(ass, cx, cy, size, 5.4, 18.7, 18.8, 18.7, color, icon_stroke(size, 0.06))
end

function icon_gear(ass, cx, cy, size, color)
  local points = {}
  for index = 0, 31 do
    local angle = (index * 11.25 - 90) * math.pi / 180
    local radius = (index % 4 == 1 or index % 4 == 2) and 9.2 or 7.2
    points[#points + 1] = {12 + math.cos(angle) * radius, 12 + math.sin(angle) * radius}
  end
  points[#points + 1] = points[1]
  icon_polyline(ass, cx, cy, size, points, color, size * 0.065)
  icon_ring(ass, cx, cy, size, 12, 12, 3.1, color, size * 0.065)
end

function icon_mini(ass, cx, cy, size, color)
  local t = icon_stroke(size, 0.075)
  icon_rect_outline(ass, cx, cy, size, 4.5, 6.5, 19.5, 17.5, color, t)
  icon_rect_outline(ass, cx, cy, size, 13.6, 12.2, 18.2, 15.8, color, t * 0.85)
end

function icon_theater(ass, cx, cy, size, color)
  local t = icon_stroke(size, 0.075)
  icon_rect_outline(ass, cx, cy, size, 3.8, 7.2, 20.2, 16.8, color, t)
  icon_line(ass, cx, cy, size, 5.8, 15, 18.2, 15, color, t * 0.9)
end

function icon_fullscreen(ass, cx, cy, size, color)
  local t = icon_stroke(size, 0.085)
  icon_polyline(ass, cx, cy, size, {{8.5, 4.8}, {4.8, 4.8}, {4.8, 8.5}}, color, t)
  icon_polyline(ass, cx, cy, size, {{15.5, 4.8}, {19.2, 4.8}, {19.2, 8.5}}, color, t)
  icon_polyline(ass, cx, cy, size, {{19.2, 15.5}, {19.2, 19.2}, {15.5, 19.2}}, color, t)
  icon_polyline(ass, cx, cy, size, {{8.5, 19.2}, {4.8, 19.2}, {4.8, 15.5}}, color, t)
end

function icon_chevron(ass, cx, cy, size, color, direction)
  if direction == "left" then
    icon_polyline(ass, cx, cy, size, {{14.7, 6.4}, {9.3, 12}, {14.7, 17.6}}, color, icon_stroke(size, 0.09))
  else
    icon_polyline(ass, cx, cy, size, {{9.3, 6.4}, {14.7, 12}, {9.3, 17.6}}, color, icon_stroke(size, 0.09))
  end
end

function icon_check(ass, cx, cy, size, color)
  icon_polyline(ass, cx, cy, size, {{5.5, 12.3}, {10, 16.5}, {18.7, 7.3}}, color, icon_stroke(size, 0.09))
end

function icon_speed(ass, cx, cy, size, color)
  local px, py = icon_point(cx, cy, size, 12, 13)
  draw_arc(ass, px, py, size * 0.33, -120, 240, icon_stroke(size, 0.07), color, 0)
  icon_line(ass, cx, cy, size, 12, 13, 16.5, 9.2, color, icon_stroke(size, 0.075))
  circle(ass, px, py, size * 0.06, color, 0)
end

function icon_audio_track(ass, cx, cy, size, color)
  icon_volume(ass, cx, cy, size * 0.94, color)
end

function icon_skip_compact(ass, cx, cy, size, color)
  local t = icon_stroke(size, 0.085)
  icon_triangle(ass, cx - size * 0.02, cy, size, {{6.4, 6.6}, {6.4, 17.4}, {13.5, 12}}, color)
  icon_triangle(ass, cx + size * 0.11, cy, size, {{11.3, 6.6}, {11.3, 17.4}, {18.4, 12}}, color)
  icon_line(ass, cx, cy, size, 4.2, 7.2, 4.2, 16.8, color, t)
end

function icon_next_episode(ass, cx, cy, size, color)
  local t = icon_stroke(size, 0.085)
  icon_triangle(ass, cx - size * 0.05, cy, size, {{6.8, 6.2}, {6.8, 17.8}, {15.4, 12}}, color)
  icon_line(ass, cx, cy, size, 18.1, 6.7, 18.1, 17.3, color, t)
end

function icon_toggle_dot(ass, cx, cy, size, color)
  circle(ass, cx, cy, size * 0.23, color, 0)
end

function icon_row(ass, name, cx, cy, size, color)
  if name == "download" then
    local r = size * 0.32
    line(ass, cx, cy - r, cx, cy + r * 0.45, 1.6, color, 0)
    line(ass, cx - r * 0.55, cy, cx, cy + r * 0.55, 1.6, color, 0)
    line(ass, cx, cy + r * 0.55, cx + r * 0.55, cy, 1.6, color, 0)
    line(ass, cx - r, cy + r, cx + r, cy + r, 1.6, color, 0)
  elseif name == "speed" then
    icon_speed(ass, cx, cy, size * 1.02, color)
  elseif name == "sub" then
    icon_cc(ass, cx, cy, size * 0.98, color)
  elseif name == "appearance" then
    icon_typography(ass, cx, cy, size * 0.94, color)
  elseif name == "audio" then
    icon_audio_track(ass, cx, cy, size * 0.96, color)
  elseif name == "video" then
    icon_theater(ass, cx, cy, size * 0.92, color)
  elseif name == "playback" then
    icon_speed(ass, cx, cy, size * 0.94, color)
  elseif name == "autoplay" then
    icon_play(ass, cx + 1, cy, size * 0.70, color)
  elseif name == "skip" then
    icon_skip_compact(ass, cx, cy, size * 0.96, color)
  elseif name == "mini" then
    icon_mini(ass, cx, cy, size * 0.95, color)
  elseif name == "theater" then
    icon_theater(ass, cx, cy, size * 0.95, color)
  elseif name == "toggle" then
    icon_toggle_dot(ass, cx, cy, size, color)
  else
    icon_fullscreen(ass, cx, cy, size * 0.94, color)
  end
end

function draw_toggle(ass, x, y, active, s)
  local w = 54 * s
  local h = 29 * s
  local thumb = 11.5 * s
  rounded_rect(ass, x - w / 2, y - h / 2, x + w / 2, y + h / 2, h / 2, active and C.accent or C.muted, active and 0 or 58)
  rounded_rect(ass, x - w / 2 + 1 * s, y - h / 2 + 1 * s, x + w / 2 - 1 * s, y + h / 2 - 1 * s, h / 2, C.black, active and 232 or 220)
  circle(ass, x + (active and 13 or -13) * s, y, thumb, C.white, active and 0 or 18)
end

function button(ass, mouse, id, cx, cy, hit, icon_size, draw_icon, active)
  hit = math.max(44, tonumber(hit) or 44)
  local hot = inside(mouse, cx - hit / 2, cy - hit / 2, cx + hit / 2, cy + hit / 2)
  local pressed = ui.mouse_down_region and ui.mouse_down_region.id == id and hot
  if hot or pressed then circle(ass, cx, cy, hit * 0.44, C.white, pressed and 200 or 235) end
  draw_icon(ass, cx, cy, icon_size, (active or hot) and C.accent or C.white)
  if active then line(ass, cx - 6, cy + hit * 0.36, cx + 6, cy + hit * 0.36, 2, C.accent, 0) end
  add_region(id, cx - hit / 2, cy - hit / 2, cx + hit / 2, cy + hit / 2)
  if hot and not ui.settings_open and not ui.dragging then
    local hints = { play = state.paused and "Play · K" or "Pause · K", back = "Back " .. seek_step_seconds() .. " seconds · J",
      forward = "Forward " .. seek_step_seconds() .. " seconds · L", next_episode = "Next episode", mute = "Mute · M",
      download = "Downloads · save episode files",
      fullscreen = "Fullscreen · F", mini = "Mini player", settings = "Settings · S", subs = "Subtitles" }
    local label = hints[id]
    if label then
      local factor = hit / PLAYER_UI.hit
      local w = math.max(90 * factor, #label * 6.5 * factor)
      local width = mp.get_osd_size()
      local tx = clamp(cx, w / 2 + 8, width - w / 2 - 8)
      rounded_rect(ass, tx - w / 2, cy - hit - 34 * factor, tx + w / 2, cy - hit - 6 * factor, 6 * factor, C.panel, 8)
      draw_text(ass, tx, cy - hit - 19 * factor, 5, 12 * factor, C.white, 0, label, false, "Segoe UI")
    end
  end
end

function pill_button(ass, mouse, id, cx, cy, width, height, label, active, s)
  local x1, y1 = cx - width / 2, cy - height / 2
  local x2, y2 = cx + width / 2, cy + height / 2
  local hot = inside(mouse, x1, y1, x2, y2)
  if hot or active then
    rounded_rect(ass, x1, y1, x2, y2, height / 2, active and C.accent or C.white, hot and 230 or 214)
  end
  draw_text(ass, cx - 7 * s, cy, 5, font_px(s, 18, 16, 19), active and C.accent or C.white, 0, label, false, "Segoe UI Semibold")
  icon_chevron(ass, cx + width / 2 - 16 * s, cy, 18 * s, active and C.accent or C.secondary, "right")
  add_region(id, x1, y1, x2, y2)
end

function control_layout(width, height, s)
  s = controls_scale(s)
  local margin, hit = PLAYER_UI.margin * s, PLAYER_UI.hit * s
  local step = hit + PLAYER_UI.gap * s
  local compact = width < 820 * s
  local left = margin + hit / 2
  return { margin = margin, hit = hit, step = step, left = left, right = width - margin - hit / 2,
    compact = compact, scale = s, y = height - margin - hit / 2 }
end

function seek_bounds(width, height, s)
  local layout = control_layout(width, height, s)
  local y = layout.y - layout.hit / 2 - math.max(20, 24 * s)
  return layout.margin, y, width - layout.margin, y
end

function volume_bounds(width, height, s)
  local layout = control_layout(width, height, s)
  s = layout.scale
  local x = layout.left + layout.step * (layout.compact and 2 or 4) + layout.hit / 2 + 10 * s
  local right_start = layout.right - layout.step * 4 - 40 * s
  local end_x = math.min(x + 110 * s, right_start - 155 * s)
  return x, layout.y, math.max(x, end_x), layout.y
end

function slider_hit_half_height(s)
  return math.max(22, math.min(32, 24 * s))
end

function draw_title_area(ass, width, height, s)
  local x = 28 * s
  draw_text(ass, x, 38 * s, 4, font_px(s, 22, 18, 28), C.white, 0, truncate_to_width(loading_media_title(), width - x * 2, font_px(s, 22, 18, 28), 0), true, "Segoe UI Semibold", true)
  draw_text(ass, x, 65 * s, 4, font_px(s, 14, 12, 18), C.white, 55, loading_episode_label(), false, "Segoe UI", true)
end

function draw_center_play(ass, width, height, mouse, s)
  if is_loading() or ui.end_overlay or ui.settings_open then return end
  s = controls_scale(s)
  local cx, cy = width / 2, height / 2
  local hit = PLAYER_UI.center_hit * s
  local hot = inside(mouse, cx - hit / 2, cy - hit / 2, cx + hit / 2, cy + hit / 2)
  add_region("center_toggle", cx - hit / 2, cy - hit / 2, cx + hit / 2, cy + hit / 2)
  local radius = hit / 2
  circle(ass, cx, cy, radius, C.black, hot and 55 or 95)
  if state.paused then
    icon_play(ass, cx + 1.5 * s, cy, PLAYER_UI.center_icon * s, C.white)
  else
    icon_pause(ass, cx, cy, PLAYER_UI.center_icon * s, C.white)
  end
end

function timeline_ratio(mouse, width, height, s)
  local x1, _, x2 = seek_bounds(width, height, s)
  if not mouse then return 0 end
  return clamp((mouse.x - x1) / math.max(1, x2 - x1), 0, 1)
end

function volume_ratio(mouse, width, height, s)
  local x1, _, x2 = volume_bounds(width, height, s)
  if not mouse then return 0 end
  return clamp((mouse.x - x1) / math.max(1, x2 - x1), 0, 1)
end

function current_drag_ratio()
  return ui.drag_preview_ratio or ui.drag_ratio
end

function set_drag_preview_ratio(ratio)
  local next_ratio = clamp(tonumber(ratio) or 0, 0, 1)
  ui.drag_ratio = next_ratio
  ui.drag_preview_ratio = next_ratio
  return next_ratio
end

function clear_drag_preview()
  ui.drag_ratio = nil
  ui.drag_preview_ratio = nil
end

function begin_drag(kind, mouse)
  ui.dragging = kind
  ui.drag_started_at = mp.get_time()
  ui.drag_start_x = mouse and mouse.x or 0
  ui.drag_start_y = mouse and mouse.y or 0
  ui.drag_has_moved = false
  ui.last_drag_command_at = -999
  ui.last_drag_draw_at = 0
  debug_input("begin " .. tostring(kind) .. " drag")
end

function drag_command_due(interval, final)
  if final then return true end
  local now = mp.get_time()
  if now - (ui.last_drag_command_at or 0) >= interval then
    ui.last_drag_command_at = now
    return true
  end
  return false
end

function draw_drag(reason)
  local now = mp.get_time()
  if now - (ui.last_drag_draw_at or 0) >= DRAG_DRAW_INTERVAL then
    ui.last_drag_draw_at = now
    draw(false, reason)
  else
    ui.pending_draw = true
  end
end

function draw_timeline(ass, width, height, mouse, s)
  local x1, y, x2 = seek_bounds(width, height, s)
  local w = x2 - x1
  local seek_hit_y = slider_hit_half_height(s)
  local seek_hot = inside(mouse, x1, y - seek_hit_y, x2, y + seek_hit_y)
  local dragging = ui.dragging == "seek"
  local h = (seek_hot or dragging) and 7 * s or 4 * s
  local ratio = state.duration > 0 and clamp(state.pos / state.duration, 0, 1) or 0
  if dragging and current_drag_ratio() then ratio = current_drag_ratio() end
  local buffered = ratio
  if state.duration > 0 and (tonumber(state.cache_end) or 0) > 0 then
    buffered = clamp(state.cache_end / state.duration, ratio, 1)
  else
    local seconds_ahead = tonumber(state.demuxer_cache_duration) or 0
    buffered = state.duration > 0 and clamp(ratio + seconds_ahead / state.duration, ratio, 1) or ratio
  end

  rounded_rect(ass, x1, y - h / 2, x2, y + h / 2, h / 2, C.track, 184)
  rounded_rect(ass, x1, y - h / 2, x1 + w * buffered, y + h / 2, h / 2, C.buffer, 118)
  rounded_rect(ass, x1, y - h / 2, x1 + w * ratio, y + h / 2, h / 2, C.accent, 0)

  for _, chapter in ipairs(state.chapters or {}) do
    if state.duration > 0 and chapter.time then
      local mx = x1 + w * clamp(chapter.time / state.duration, 0, 1)
      if is_intro_chapter(chapter) then
        rounded_rect(ass, mx - 2 * s, y - 10 * s, mx + 2 * s, y + 10 * s, 2 * s, C.accent, 0)
      elseif is_outro_chapter(chapter) then
        rounded_rect(ass, mx - 2 * s, y - 9 * s, mx + 2 * s, y + 9 * s, 2 * s, C.hover, 34)
      end
    end
  end

  circle(ass, x1 + w * ratio, y, dragging and 12 * s or ((seek_hot and 10 * s) or 7 * s), C.accent, 0)
  local display_pos = dragging and state.duration * ratio or state.pos
  draw_text(ass, x2, y - 20 * s, 6, font_px(s, 17, 16, 19), C.white, 0, string.format("%s / %s", format_time(display_pos), state.duration > 0 and format_time(state.duration) or "--:--"), false, "Segoe UI", true)
  add_region("seek", x1, y - seek_hit_y, x2, y + seek_hit_y)

  if seek_hot and state.duration > 0 then
    local preview_ratio = timeline_ratio(mouse, width, height, s)
    local px = x1 + w * preview_ratio
    rounded_rect(ass, px - 44 * s, y - 50 * s, px + 44 * s, y - 22 * s, 8 * s, C.panel, 18)
    draw_text(ass, px, y - 31 * s, 5, font_px(s, 14, 13, 16), C.white, 0, format_time(preview_ratio * state.duration), true, "Segoe UI Semibold")
  end
end

function draw_controls(ass, width, height, mouse, s)
  local layout = control_layout(width, height, s)
  s = layout.scale
  local y, x, hit, step = layout.y, layout.left, layout.hit, layout.step
  local icon = PLAYER_UI.icon * s
  button(ass, mouse, "play", x, y, hit, icon, icon_play_pause)
  x = x + step
  if not layout.compact then
    button(ass, mouse, "back", x, y, hit, icon, function(a, xx, yy, size, color) icon_skip(a, xx, yy, size, color, false) end)
    x = x + step
    button(ass, mouse, "forward", x, y, hit, icon, function(a, xx, yy, size, color) icon_skip(a, xx, yy, size, color, true) end)
    x = x + step
  end
  button(ass, mouse, "next_episode", x, y, hit, icon, icon_next_episode)
  x = x + step
  button(ass, mouse, "mute", x, y, hit, icon, icon_volume)
  local vx1, vy, vx2 = volume_bounds(width, height, s)
  if vx2 > vx1 + 40 * s then
    local volume_dragging = ui.dragging == "volume"
    local vr = volume_dragging and (current_drag_ratio() or 0) or clamp((state.volume or 0) / 130, 0, 1)
    rounded_rect(ass, vx1, vy - 2 * s, vx2, vy + 2 * s, 2 * s, C.track, 150)
    rounded_rect(ass, vx1, vy - 2 * s, vx1 + (vx2 - vx1) * vr, vy + 2 * s, 2 * s, C.accent, 0)
    circle(ass, vx1 + (vx2 - vx1) * vr, vy, 5 * s, C.accent, 0)
    add_region("volume", vx1 - 8 * s, vy - 22, vx2 + 8 * s, vy + 22)
  end
  local right = layout.right
  button(ass, mouse, "fullscreen", right, y, hit, icon, icon_fullscreen, state.fullscreen)
  if layout.compact then
    -- Speed, mini-player and track controls remain in the existing settings menu.
    button(ass, mouse, "settings", right - step, y, hit, icon, icon_gear, ui.settings_open)
  else
    button(ass, mouse, "mini", right - step, y, hit, icon, icon_mini, state.mini_player)
    pill_button(ass, mouse, "speed", right - step * 2 - 5 * s, y, step + 10 * s, hit, speed_label(), ui.settings_open and ui.submenu == "speed", s)
    button(ass, mouse, "settings", right - step * 3 - 10 * s, y, hit, icon, icon_gear, ui.settings_open)
    button(ass, mouse, "subs", right - step * 4 - 10 * s, y, hit, icon, icon_cc, state.sub_visible and state.sid ~= "no")
    local download_x = right - step * 5 - 10 * s
    if download_x - hit / 2 > vx2 + 24 * s then
      button(ass, mouse, "download", download_x, y, hit, icon,
        function(a, xx, yy, size, color) icon_row(a, "download", xx, yy, size, color) end, state.download_status ~= nil)
    end
  end
end

function manual_skip_range(kind)
  if ui.settings_open or ui.dragging then return nil end
  if ui.end_overlay or state.paused then return nil end
  if is_loading() or is_buffering() then return nil end
  if kind == "intro" and state.skip_intro then return nil end
  if kind == "outro" and state.skip_outro then return nil end
  local range = manual_strict_skip_range(kind, tonumber(state.pos) or 0)
  if not range then return nil end
  local entry = skip_state_for(range.key)
  if not entry or entry.clicked or entry.auto_skipped or entry.dismissed then return nil end
  local now = mp.get_time()
  if not entry.shown then
    entry.shown = true
    entry.shown_at = now
    entry.visible_until = now + MANUAL_SKIP_BUTTON_SECONDS
    msg.info(string.format(
      "[StreamNyaa Lua] Showing manual Skip %s button source=%s",
      kind == "outro" and "Outro" or "Intro",
      tostring(range.source)
    ))
  elseif entry.visible_until and now > entry.visible_until then
    entry.dismissed = true
    return nil
  end
  range.state = entry
  return range
end

function wake_manual_skip_buttons()
  if ui.settings_open or ui.dragging then return false end
  if ui.end_overlay or state.paused then return false end
  if is_loading() or is_buffering() then return false end
  local woke = false
  local newly_shown = false
  local now = mp.get_time()
  for _, kind in ipairs({ "intro", "outro" }) do
    if not ((kind == "intro" and state.skip_intro) or (kind == "outro" and state.skip_outro)) then
      local range = manual_strict_skip_range(kind, tonumber(state.pos) or 0)
      if range then
        local entry = skip_state_for(range.key)
        if entry and not entry.clicked and not entry.auto_skipped and not entry.dismissed then
          if not entry.shown then
            entry.shown = true
            entry.shown_at = now
            entry.visible_until = now + MANUAL_SKIP_BUTTON_SECONDS
            newly_shown = true
            msg.info(string.format(
              "[StreamNyaa Lua] Showing manual Skip %s button source=%s",
              kind == "outro" and "Outro" or "Intro",
              tostring(range.source)
            ))
          elseif entry.visible_until and now > entry.visible_until then
            entry.dismissed = true
          end
          if not entry.dismissed and now <= (entry.visible_until or 0) then
            woke = true
          end
        end
      end
    end
  end
  -- A skip marker is a prompt, not a request to open the full player controls.
  -- Preserve controls only when the user intentionally interacted moments ago.
  if newly_shown and now - (ui.last_direct_interaction or 0) > 0.9 then
    ui.visible = false
    ui.settings_open = false
    ui.submenu = "main"
  end
  return woke
end

function draw_manual_skip_button(ass, mouse, range, index, width, height, s)
  if not range then return end
  local label = range.kind == "outro" and "Skip outro" or "Skip intro"
  local button_w = 148 * s
  local button_h = 40 * s
  local x2 = width - 48 * s
  local base_offset = ui.visible and 180 or 140
  local y2 = height - (base_offset + (index or 0) * 50) * s
  local x1 = x2 - button_w
  local y1 = y2 - button_h
  local center_x = (x1 + x2) / 2
  local center_y = (y1 + y2) / 2
  local hot = inside(mouse, x1, y1, x2, y2)

  rounded_rect(ass, x1, y1, x2, y2, 8 * s, hot and C.panel_2 or C.panel, hot and 0 or 12)
  rounded_outline(ass, x1, y1, x2, y2, 8 * s, 1.0 * s, hot and C.accent or C.white, hot and 80 or 220)
  rounded_rect(ass, x1, y1 + 8 * s, x1 + 3 * s, y2 - 8 * s, 1.5 * s, C.accent, 0)
  icon_skip_compact(ass, center_x - 43 * s, center_y, 16 * s, hot and C.hover or C.white)
  draw_text(ass, center_x + 10 * s, center_y + 1 * s, 5, font_px(s, 13, 12, 15), C.white, 0, label, true, "Segoe UI Semibold")
  add_region("manual_skip_" .. tostring(range.kind), x1, y1, x2, y2, {
    key = range.key,
    kind = range.kind,
    start_time = range.start_time,
    end_time = range.end_time,
    source = range.source,
  })
end

function draw_manual_skip_buttons(ass, width, height, mouse, s, resolved_intro, resolved_outro, ranges_resolved)
  local intro = ranges_resolved and resolved_intro or manual_skip_range("intro")
  local outro = ranges_resolved and resolved_outro or manual_skip_range("outro")
  if outro then draw_manual_skip_button(ass, mouse, outro, intro and 1 or 0, width, height, s) end
  if intro then draw_manual_skip_button(ass, mouse, intro, 0, width, height, s) end
end

function draw_end_button(ass, mouse, id, x1, y1, x2, y2, label, primary, s, disabled)
  local hot = not disabled and inside(mouse, x1, y1, x2, y2)
  local fill = disabled and C.muted or (primary and C.accent or C.panel_2)
  local text_color = disabled and C.secondary or C.white
  rounded_rect(ass, x1, y1, x2, y2, 8 * s, fill, disabled and 55 or (hot and 0 or (primary and 8 or 18)))
  rounded_outline(ass, x1, y1, x2, y2, 8 * s, 1.0 * s, primary and C.hover or C.white, disabled and 220 or (hot and 70 or 210))
  draw_text(ass, (x1 + x2) / 2, (y1 + y2) / 2 + 1 * s, 5, font_px(s, 13, 12, 15), text_color, 0, label, true, "Segoe UI Semibold")
  if not disabled then add_region(id, x1, y1, x2, y2) end
end

function icon_replay(ass, cx, cy, size, color)
  local t = icon_stroke(size, 0.085)
  draw_arc(ass, cx, cy, size * 0.40, -55, 285, t, color, 0)
  icon_polyline(ass, cx, cy, size, {{7.6, 4.9}, {4.6, 6.2}, {6.0, 9.1}}, color, t)
end

function draw_end_action(ass, mouse, id, x1, y1, x2, y2, label, primary, s, disabled, icon_name)
  local hot = not disabled and inside(mouse, x1, y1, x2, y2)
  local fill = primary and (hot and C.hover or C.accent) or (hot and C.panel_2 or C.panel)
  local alpha = disabled and 105 or (primary and 0 or 16)
  rounded_rect(ass, x1, y1, x2, y2, 8 * s, disabled and C.muted or fill, alpha)
  if not primary then
    rounded_outline(ass, x1, y1, x2, y2, 8 * s, 1.0 * s, C.white, disabled and 236 or (hot and 164 or 214))
  end
  local icon_x = x1 + 24 * s
  local center_y = (y1 + y2) / 2
  if icon_name == "next" then
    icon_next_episode(ass, icon_x, center_y, 19 * s, disabled and C.secondary or C.white)
  elseif icon_name == "replay" then
    icon_replay(ass, icon_x, center_y, 19 * s, disabled and C.secondary or C.white)
  end
  local text_x = icon_name and (x1 + 45 * s) or ((x1 + x2) / 2)
  local align = icon_name and 4 or 5
  draw_text(ass, text_x, center_y + 1 * s, align, font_px(s, 13, 12, 15), disabled and C.secondary or C.white, 0, label, true, "Segoe UI Semibold")
  if not disabled then add_region(id, x1, y1, x2, y2) end
end

function end_overlay_layout(width, height, s)
  local scale = math.min(controls_scale(s), (width - 32) / 520, (height - 32) / 246)
  return { x = (width - 520 * scale) / 2, y = (height - 246 * scale) / 2, w = 520 * scale, h = 246 * scale, s = scale }
end

function draw_end_overlay(ass, width, height, mouse, s)
  if not ui.end_overlay then return end
  local p = end_overlay_layout(width, height, s)
  s = p.s
  local x, y, w, h = p.x, p.y, p.w, p.h
  rect(ass, 0, 0, width, height, C.black, 180)
  rounded_rect(ass, x, y, x + w, y + h, 14 * s, C.panel, 0)
  rounded_outline(ass, x, y, x + w, y + h, 14 * s, s, C.white, 220)
  local unavailable = ui.end_status == "unavailable"
  draw_text(ass, x + 28 * s, y + 36 * s, 4, 25 * s, C.white, 0, unavailable and "You're caught up" or "Episode complete", true, "Segoe UI Semibold")
  local title = tostring(player_meta.animeTitle ~= "" and player_meta.animeTitle or state.title or ""):gsub("[\r\n]", " ")
  draw_text(ass, x + 28 * s, y + 72 * s, 4, 16 * s, C.white, 8, truncate_to_width(title, w - 56 * s, 16 * s, 0), true, "Segoe UI Semibold")
  local detail = unavailable and "No next aired episode yet."
    or ui.end_status == "opening" and "Opening the next episode…"
    or ui.end_status == "preparing" and "Preparing the next episode…"
    or ui.end_status == "failed" and "Couldn't prepare the next episode. Try again."
    or "Continue with the next episode, or watch this one again."
  draw_text(ass, x + 28 * s, y + 103 * s, 4, 13 * s, C.secondary, 0, detail, false, "Segoe UI")
  draw_text(ass, x + 28 * s, y + 130 * s, 4, 12 * s, C.secondary, 0, state.autoplay and "Autoplay on" or "Autoplay off", false, "Segoe UI")
  local bx, by = x + 28 * s, y + 168 * s
  if not unavailable then
    local label = ui.end_status == "opening" and "Opening…" or ui.end_next_pending and "Preparing…" or ui.end_status == "failed" and "Try again" or "Next episode"
    draw_end_action(ass, mouse, "end_next_episode", bx, by, bx + 196 * s, by + 48 * s, label, true, s, ui.end_next_pending, "next")
    bx = bx + 208 * s
  end
  draw_end_action(ass, mouse, "end_replay", bx, by, bx + 118 * s, by + 48 * s, "Replay", unavailable, s, false, "replay")
  bx = bx + 130 * s
  draw_end_action(ass, mouse, "end_close", bx, by, bx + 126 * s, by + 48 * s, "Close", false, s, false)
  for _, region in ipairs(regions) do
    if region.id == ui.end_focus then
      rounded_outline(ass, region.x1 - 3 * s, region.y1 - 3 * s, region.x2 + 3 * s, region.y2 + 3 * s, 10 * s, 1.5 * s, C.white, 32)
    end
  end
end

function loading_status_text()
  if is_midplayback_buffering() then
    return buffering_status_label()
  elseif native_buffering_active() and not is_placeholder_media() then
    return buffering_status_label()
  elseif ui.startup_stream_backup_requested then
    return "SWITCHING TO A VERIFIED BACKUP"
  elseif ui.startup_stream_retried then
    return "REOPENING THE CURRENT STREAM"
  elseif is_placeholder_media() then
    local stage = tostring(mp.get_property("user-data/streamnyaa/state", "")):lower()
    if stage:find("metadata") then return "CHECKING EPISODE AVAILABILITY" end
    if stage:find("matching") then return "MATCHING THE EPISODE FILE" end
    if stage:find("buffer") then return "BUILDING THE PLAYABLE BUFFER" end
    if stage:find("prepar") then return "PREPARING THE VIDEO STREAM" end
    return "OPENING THE PLAYER"
  elseif not has_playable_media() and tostring(state.path or "") ~= "" then
    return "OPENING THE VIDEO DECODER"
  elseif state.idle or state.core_idle then
    return "STARTING PLAYBACK..."
  end
  return "PREPARING STREAM..."
end

function startup_loading_percent()
  local playable_percent = buffering_display_percent()
  if playable_percent ~= nil and not is_placeholder_media() then
    return math.floor(clamp(playable_percent, 0, 100) + 0.5)
  end
  local raw_value = mp.get_property("user-data/streamnyaa/loading_percent", "")
  local value = tonumber(raw_value)
  if not value then return nil end
  local next_value = math.floor(clamp(value, 0, 96) + 0.5)
  ui.last_startup_loading_percent = math.max(tonumber(ui.last_startup_loading_percent) or 0, next_value)
  return ui.last_startup_loading_percent
end

function loading_episode_label()
  local episode_number = tostring(player_meta.episodeNumber or ""):gsub("^%s+", ""):gsub("%s+$", "")
  local episode_title = tostring(player_meta.episodeTitle or ""):gsub("^%s+", ""):gsub("%s+$", "")
  local prefix = episode_number ~= "" and ("Episode " .. episode_number) or ""
  if prefix ~= "" and episode_title ~= "" then return prefix .. "  ·  " .. episode_title end
  if prefix ~= "" then return prefix end
  return episode_title
end

function draw_loading_required_content(ass, width, height, s, status)
  local cx = width / 2
  if ui.recovery_terminal then
    local cy = height * 0.48
    draw_text(ass, cx, cy, 5, font_px(s, 21, 18, 26), C.white, 0, "Playback couldn't continue", true, "Segoe UI Semibold")
    draw_text(ass, cx, cy + 32 * s, 5, font_px(s, 14, 12, 16), C.secondary, 0, "Your position is saved. Retry or choose another stream.", false, "Segoe UI")
    local y = cy + 62 * s
    draw_end_button(ass, mouse_pos(), "recovery_retry", cx - 174 * s, y, cx - 10 * s, y + 44 * s, "Retry", false, s)
    draw_end_button(ass, mouse_pos(), "recovery_backup", cx + 10 * s, y, cx + 174 * s, y + 44 * s, "Try another stream", true, s)
    return
  end
  if is_midplayback_buffering() then
    local cy = height * 0.48
    local radius = clamp(25 * s, 19, 34)
    local stroke = math.max(2, 2.5 * s)
    local percent = buffering_display_percent()
    draw_arc(ass, cx, cy, radius, 0, 360, stroke, C.white, 202)
    if percent ~= nil and percent > 0 then
      draw_arc(ass, cx, cy, radius, 0, percent * 3.6, stroke, C.accent, 0)
    else
      draw_arc(ass, cx, cy, radius, (mp.get_time() * 180) % 360, 78, stroke, C.accent, 0)
    end
    -- MPV's cache fill percentage, never total torrent completion or a timer.
    draw_text(ass, cx, cy + radius + 24 * s, 5, font_px(s, 18, 16, 22), C.white, 0, percent ~= nil and string.format("%d%%", percent) or "—", true, "Segoe UI Semibold")
    local label = ui.recovery_attempt and "Reconnecting" or "Buffering"
    draw_text(ass, cx, cy + radius + 48 * s, 5, font_px(s, 12, 11, 14), C.secondary, 12, percent == nil and "Measuring buffer" or label, false, "Segoe UI")
    return
  end

  local artwork_layout = tostring(player_meta.artworkLayout or "landscape")
  local layout = loading_title_layout(loading_media_title(), width, height, s)
  local title_size = clamp(layout.size, 50 * s, 94 * s)
  local line_gap = title_size * 1.08
  local title_x = width * 0.065
  local title_center_y = height * 0.60
  local first_line_y = title_center_y - ((#layout.lines - 1) * line_gap / 2)
  local episode_label = loading_episode_label()
  local detail_y = first_line_y + #layout.lines * line_gap + 7 * s
  local status_y = detail_y + (episode_label ~= "" and 40 * s or 12 * s)
  local t = (mp.get_time() - ui.anim_started)
  local percent = startup_loading_percent()
  local status_text = status

  -- Readability is baked into the generated full-viewport artwork with a
  -- smooth neutral gradient. Avoid visible overlay bands and color tinting.

  local accent_top = first_line_y - title_size * 0.54
  local accent_bottom = first_line_y + (#layout.lines - 1) * line_gap + title_size * 0.54
  rounded_rect(ass, title_x - 16 * s, accent_top, title_x - 12 * s, accent_bottom, 2 * s, C.accent, 0)

  for index, line_value in ipairs(layout.lines) do
    draw_text(
      ass,
      title_x,
      first_line_y + (index - 1) * line_gap,
      4,
      title_size,
      C.white,
      0,
      line_value,
      true,
      "Segoe UI Semibold"
    )
  end

  if episode_label ~= "" then
    draw_text(ass, title_x, detail_y, 4, font_px(s, 17, 14, 20), C.secondary, 3, episode_label, false, "Segoe UI")
  end
  local activity_alpha = math.floor(28 + ((math.sin(t * 4.2) + 1) / 2) * 112)
  circle(ass, title_x + 4 * s, status_y, 4 * s, C.accent, activity_alpha)
  draw_text(ass, title_x + 18 * s, status_y, 4, font_px(s, 14, 12, 17), C.white, 4, status_text, true, "Segoe UI Semibold")

  local bar_x1 = title_x
  local bar_x2 = title_x + math.min(width * (artwork_layout == "portrait" and 0.42 or 0.38), 560 * s)
  if percent ~= nil then
    draw_text(ass, bar_x2, status_y + 2 * s, 6, font_px(s, 23, 19, 28), C.accent, 0, string.format("%d%%", percent), true, "Segoe UI Semibold")
  else
    draw_text(ass, bar_x2, status_y + 1 * s, 6, font_px(s, 12, 11, 14), C.secondary, 0, "Connecting", true, "Segoe UI Semibold")
  end
  local bar_y = status_y + 24 * s
  rounded_rect(ass, bar_x1, bar_y, bar_x2, bar_y + 4 * s, 2 * s, C.white, 220)
  if percent then
    rounded_rect(ass, bar_x1, bar_y, bar_x1 + (bar_x2 - bar_x1) * clamp(percent / 100, 0, 1), bar_y + 4 * s, 2 * s, C.accent, 0)
  else
    local segment = (bar_x2 - bar_x1) * 0.22
    local pulse_x = bar_x1 + ((bar_x2 - bar_x1) - segment) * ((math.sin(t * 3.0) + 1) / 2)
    rounded_rect(ass, pulse_x, bar_y, pulse_x + segment, bar_y + 4 * s, 2 * s, C.accent, 0)
  end
  local cached = buffered_seconds()
  if cached and not is_placeholder_media() then
    draw_text(ass, bar_x1, bar_y + 20 * s, 4, font_px(s, 12, 11, 14), C.secondary, 0, string.format("%.1fs buffered", cached), false, "Segoe UI")
  end
  if ui.startup_stream_actions_visible then
    local button_y = math.min(height - 66 * s, bar_y + 24 * s)
    local button_w = 156 * s
    local gap = 12 * s
    draw_end_button(ass, mouse_pos(), "recovery_retry", bar_x1, button_y, bar_x1 + button_w, button_y + 40 * s, "RETRY STREAM", false, s)
    draw_end_button(ass, mouse_pos(), "recovery_backup", bar_x1 + button_w + gap, button_y, bar_x1 + button_w * 2 + gap, button_y + 40 * s, "TRY BACKUP SOURCE", true, s)
  end
end

function draw_loading(ass, width, height, s, cover_info)
  if not (is_loading() or is_buffering() or hold_cover_for_first_video_frame()) then return end
  local cx = width / 2
  local status = loading_status_text()
  local buffering_only = is_midplayback_buffering()
  local cover_media = is_cover_loading_media()
  local before_len = #ass.text

  local ok, err = pcall(function()
    if buffering_only then
      rect(ass, 0, 0, width, height, C.black, 214)
    elseif cover_info or cover_media then
      rect(ass, 0, 0, width, height, C.black, 150)
    else
      rect(ass, 0, 0, width, height, C.black, 0)
      rect(ass, 0, 0, width, height, C.panel, 80)
    end
    draw_loading_required_content(ass, width, height, s, status)
  end)

  if not ok then
    msg.warn("StreamNyaa loading UI fallback was used: " .. tostring(err))
    draw_text(ass, cx, height * 0.43, 5, font_px(s, 46, 32, 58), C.white, 0, normalize_loading_title(loading_media_title()), true, "Segoe UI Semibold")
    draw_text(ass, cx, height * 0.52, 5, font_px(s, 18, 16, 21), C.white, 4, status, true, "Segoe UI Semibold")
  end

  debug_loading(
    string.format(
      "drawn title=%s status=%s cover=%s ass_added=%d",
      tostring(loading_media_title()),
      tostring(status),
      cover_info and tostring(cover_info.kind or "cover") or (cover_media and "loading-cover-media" or "fallback"),
      #ass.text - before_len
    )
  )
end

function draw_stream_status_badge(ass, width, height, s)
  if not is_loading() and not is_buffering() then return end
  local progress = stream_progress()
  local label = stream_status_label()
  local text_value = progress > 0 and string.format("%s  %d%%", label, math.floor(progress + 0.5)) or label
  local x2 = width - 48 * s
  local y1 = 42 * s
  local w = 148 * s
  local h = 34 * s
  rounded_rect(ass, x2 - w, y1, x2, y1 + h, h / 2, C.panel, 36)
  circle(ass, x2 - w + 20 * s, y1 + h / 2, 4 * s, C.accent, 0)
  draw_text(ass, x2 - 17 * s, y1 + h / 2 + 5 * s, 6, 12 * s, C.white, 0, text_value, true, "Segoe UI Semibold")
end

function draw_smoke_test(ass, width, height, s)
  rect(ass, 0, 0, width, height, C.black, 0)
  draw_text(
    ass,
    width / 2,
    height / 2,
    5,
    font_px(s, 42, 32, 54),
    C.white,
    0,
    "STREAMNYAA OSD TEST",
    true,
    "Segoe UI Semibold"
  )
end

function panel_bounds(width, height, s, row_count)
  local panel_w = 392 * s
  local row_h = 57 * s
  local header_h = 56 * s
  local panel_h = header_h + row_h * row_count + 12 * s
  local x2 = width - 54 * s
  local x1 = x2 - panel_w
  local y2 = height - 112 * s
  local y1 = y2 - panel_h
  local min_y = 22 * s
  if y1 < min_y and row_count > 0 then
    local available = math.max(220 * s, y2 - min_y - header_h - 12 * s)
    row_h = math.max(34 * s, available / row_count)
    panel_h = header_h + row_h * row_count + 12 * s
    y1 = y2 - panel_h
  end
  return x1, y1, x2, y2, row_h, header_h
end

function draw_panel_shell(ass, x1, y1, x2, y2, title, s)
  rounded_rect(ass, x1 + 5 * s, y1 + 9 * s, x2 + 5 * s, y2 + 9 * s, 18 * s, C.shadow, 142)
  rounded_rect(ass, x1, y1, x2, y2, 17 * s, C.line, 222)
  rounded_rect(ass, x1 + 1 * s, y1 + 1 * s, x2 - 1 * s, y2 - 1 * s, 16 * s, C.panel, 12)
  rounded_rect(ass, x1 + 2 * s, y1 + 2 * s, x2 - 2 * s, y1 + 56 * s, 16 * s, C.panel_2, 76)
  draw_text(ass, x1 + 26 * s, y1 + 37 * s, 4, font_px(s, 18, 17, 20), C.white, 0, title, true, "Segoe UI Semibold")
end

function draw_settings_row(ass, mouse, id, x1, y1, x2, y2, icon, label, value, row_type, active, s)
  local hot = inside(mouse, x1, y1, x2, y2)
  local cy = (y1 + y2) / 2
  if hot then rounded_rect(ass, x1 + 10 * s, y1 + 5 * s, x2 - 10 * s, y2 - 5 * s, 12 * s, C.white, 236) end
  rect(ass, x1 + 24 * s, y2 - 1 * s, x2 - 24 * s, y2, C.line, 234)
  icon_row(ass, icon, x1 + 40 * s, cy, 26 * s, active and C.accent or C.secondary)
  draw_text(ass, x1 + 76 * s, cy + 6 * s, 4, font_px(s, 16, 15, 18), active and C.white or C.white, active and 0 or 28, label, false, "Segoe UI")
  if row_type == "toggle" then
    draw_toggle(ass, x2 - 44 * s, cy, active, s)
  else
    draw_text(ass, x2 - 58 * s, cy + 6 * s, 6, font_px(s, 15, 14, 17), active and C.accent or C.secondary, active and 0 or 14, ellipsize(value or "", 24), false, "Segoe UI")
    icon_chevron(ass, x2 - 25 * s, cy, 22 * s, active and C.accent or C.secondary, "right")
  end
  add_region(id, x1, y1, x2, y2)
end

function subtitle_style_cache_key()
  local style = state.subtitle_style or {}
  return table.concat({
    tostring(style.font_size),
    tostring(style.position),
    tostring(style.text_color),
    tostring(style.outline),
    tostring(style.shadow),
    tostring(style.background),
    tostring(style.custom),
  }, "|")
end

function sleep_timer_label()
  if not ui.sleep_deadline then return "Off" end
  return tostring(math.max(1, math.ceil((ui.sleep_deadline - mp.get_time()) / 60))) .. " min left"
end

function set_sleep_timer(minutes)
  local allowed = { [0] = true, [15] = true, [30] = true, [60] = true, [90] = true, [120] = true }
  minutes = tonumber(minutes)
  if not minutes or not allowed[minutes] then return false end
  ui.sleep_deadline = minutes > 0 and mp.get_time() + minutes * 60 or nil
  ui.sleep_expired = false
  mark_menu_dirty("main")
  mark_menu_dirty("sleep")
  return true
end

function check_sleep_timer()
  if not ui.sleep_deadline or mp.get_time() < ui.sleep_deadline then return end
  ui.sleep_deadline = nil
  ui.sleep_expired = true
  hide_end_overlay(true)
  state.paused = true
  safe_set_property_bool("pause", true)
  mark_menu_dirty("main")
  mark_menu_dirty("sleep")
  show_overlay()
  settings_notice("Sleep timer ended. Playback paused.")
  draw(true, "sleep-timer")
end

function menu_cache_key(menu)
  if menu == "main" then
    return table.concat({
      tostring(seek_step_seconds()),
      tostring(state.download_status),
      sleep_timer_label(),
      tostring(state.speed),
      tostring(state.sid),
      tostring(state.aid),
      tostring(state.sub_visible),
      tostring(state.sub_delay),
      tostring(state.audio_delay),
      tostring(state.video_aspect),
      tostring(state.video_zoom),
      tostring(state.loop_file),
      tostring(state.autoplay),
      tostring(state.skip_intro),
      tostring(state.skip_outro),
      tostring(state.mini_player),
      tostring(state.fullscreen),
      subtitle_style_cache_key(),
      tostring(track_cache_generation),
    }, "|")
  elseif menu == "speed" then
    return tostring(state.speed)
  elseif menu == "seek_step" then
    return tostring(seek_step_seconds())
  elseif menu == "subs" then
    return table.concat({ tostring(state.sid), tostring(state.sub_visible), tostring(state.sub_delay), tostring(track_cache_generation) }, "|")
  elseif menu == "appearance" then
    return subtitle_style_cache_key()
  elseif starts_with(menu, "appearance_") then
    local kind = menu:gsub("^appearance_", "")
    return tostring(kind) .. "|" .. tostring((state.subtitle_style or {})[kind])
  elseif menu == "audio" then
    return table.concat({ tostring(state.aid), tostring(state.audio_delay), tostring(track_cache_generation) }, "|")
  elseif menu == "video" or menu == "video_aspect" or menu == "video_zoom" then
    return table.concat({ tostring(menu), tostring(state.video_aspect), tostring(state.video_zoom) }, "|")
  elseif menu == "playback" then
    return table.concat({ tostring(state.speed), tostring(state.loop_file), tostring(state.remember_speed) }, "|")
  end
  return tostring(menu)
end

function cached_menu_rows(menu, builder)
  local key = menu_cache_key(menu)
  local cache = menu_row_cache[menu]
  if menu_cache_dirty[menu] ~= false or not cache or cache.key ~= key then
    local started = mp.get_time()
    local rows = builder() or {}
    menu_row_cache[menu] = { key = key, rows = rows }
    menu_cache_dirty[menu] = false
    submenu_perf("build:" .. tostring(menu), started, "rows=" .. tostring(#rows))
  end
  return menu_row_cache[menu].rows
end

function append_track_rows(options, tracks, active_fn, max_rows, overflow_label)
  local visible = #tracks
  if max_rows and max_rows > 0 then
    visible = math.min(#tracks, max_rows)
  end
  for i = 1, visible do
    local track = tracks[i]
    options[#options + 1] = {
      label = ellipsize(track_label(track), 44),
      value = track.id,
      active = active_fn and active_fn(track) or false,
    }
  end
  if max_rows and max_rows > 0 and #tracks > visible then
    options[#options + 1] = {
      label = string.format("%d more %s", #tracks - visible, overflow_label or "tracks"),
      value = "__more",
      detail = "Not shown",
      disabled = true,
    }
  end
end

function build_main_settings_rows()
  return {
    { id = "settings:download", icon = "download", label = "Downloads · save episode files", value = "Open manager…", type = "action" },
    { id = "settings:seek_step", icon = "skip", label = "Seek step", value = tostring(seek_step_seconds()) .. " seconds", type = "submenu" },
    { id = "settings:sleep", icon = "speed", label = "Sleep timer", value = sleep_timer_label(), type = "submenu" },
    { id = "settings:subs", icon = "sub", label = "Subtitles / CC", value = current_track_label("sub", "Off"), type = "submenu", active = state.sub_visible and state.sid ~= "no" },
    { id = "settings:appearance", icon = "appearance", label = "Subtitle Appearance", value = subtitle_style_summary(), type = "submenu", active = state.subtitle_style.custom },
    { id = "settings:audio", icon = "audio", label = "Audio", value = current_track_label("audio", "Auto") .. " / " .. format_audio_delay(state.audio_delay), type = "submenu", active = math.abs(tonumber(state.audio_delay) or 0) >= 0.005 },
    { id = "settings:video", icon = "video", label = "Video", value = video_aspect_label() .. " / " .. video_zoom_label(), type = "submenu", active = state.video_aspect ~= "default" or math.abs(tonumber(state.video_zoom) or 0) >= 0.005 },
    { id = "settings:playback", icon = "speed", label = "Playback Speed", value = speed_label(), type = "submenu", active = state.loop_file or math.abs((tonumber(state.speed) or 1) - 1) >= 0.03 },
    { id = "settings:autoplay", icon = "autoplay", label = "Auto Next Episode", value = "", type = "toggle", active = state.autoplay },
    { id = "settings:skip", icon = "skip", label = "Auto Skip Marked Intro", value = "", type = "toggle", active = state.skip_intro },
    { id = "settings:skip_outro", icon = "skip", label = "Auto Skip Marked Outro", value = "", type = "toggle", active = state.skip_outro },
    { id = "settings:mini", icon = "mini", label = "Mini Player", value = "", type = "toggle", active = state.mini_player },
    { id = "settings:fullscreen", icon = "full", label = "Full Screen", value = state.fullscreen and "On" or "Off", type = "action", active = state.fullscreen },
  }
end

function build_submenu_rows(menu)
  if menu == "sleep" then
    local rows = {}
    for _, minutes in ipairs({0, 15, 30, 60, 90, 120}) do
      rows[#rows + 1] = { label = minutes == 0 and "Off" or tostring(minutes) .. " minutes", value = minutes, active = minutes == 0 and not ui.sleep_deadline }
    end
    return "Sleep timer", rows, "sleep:"
  end
  if menu == "seek_step" then
    local options = {}
    for seconds = 5, 60, 5 do
      options[#options + 1] = { label = tostring(seconds) .. " seconds", value = seconds, active = seek_step_seconds() == seconds }
    end
    return "Seek step", options, "seek_step:"
  elseif menu == "speed" then
    local options = {}
    for _, speed in ipairs(SPEEDS) do
      options[#options + 1] = { label = speed_label(speed), value = speed, active = math.abs((state.speed or 1) - speed) < 0.03 }
    end
    return "Playback Speed", options, "speed:"
  elseif menu == "subs" then
    local options = { { label = "Off", value = "no", active = state.sid == "no" or not state.sub_visible } }
    local subtitle_tracks = tracks_by_type("sub")
    if #subtitle_tracks == 0 then
      options[#options + 1] = { label = "No subtitle tracks", value = "none", detail = "Available", disabled = true }
    else
      append_track_rows(options, subtitle_tracks, function(track)
        return state.sub_visible and tostring(state.sid) == tostring(track.id)
      end, 0, "subtitle tracks")
    end
    options[#options + 1] = { label = "Subtitle Delay", value = "delay_info", detail = format_sub_delay(state.sub_delay), disabled = true }
    options[#options + 1] = { label = "-0.1s", value = "delay_down", detail = format_sub_delay((tonumber(state.sub_delay) or 0) - 0.1) }
    options[#options + 1] = { label = "+0.1s", value = "delay_up", detail = format_sub_delay((tonumber(state.sub_delay) or 0) + 0.1) }
    options[#options + 1] = { label = "Reset Delay", value = "delay_reset", detail = "0.0s", active = math.abs(tonumber(state.sub_delay) or 0) < 0.005 }
    options[#options + 1] = { label = "Import Custom Subtitle...", value = "import", detail = "Choose file", action = true }
    return "Subtitles", options, "sub:"
  elseif menu == "appearance" then
    local options = {}
    for _, item in ipairs(SUBTITLE_STYLE_MENU) do
      options[#options + 1] = {
        label = item.label,
        value = item.kind,
        detail = subtitle_style_label(item.kind),
        action = true,
        active = state.subtitle_style.custom and state.subtitle_style[item.kind] ~= SUBTITLE_STYLE_DEFAULT[item.kind],
      }
    end
    options[#options + 1] = { label = "Reset Subtitle Style", value = "reset", detail = state.subtitle_style.custom and "Restore defaults" or "Default", action = true, active = false }
    return "Subtitle Appearance", options, "appearance:"
  elseif starts_with(menu, "appearance_") then
    local kind = menu:gsub("^appearance_", "")
    local menu_title = "Subtitle Style"
    for _, item in ipairs(SUBTITLE_STYLE_MENU) do
      if item.kind == kind then
        menu_title = item.label
        break
      end
    end
    local options = {}
    for _, option in ipairs(SUBTITLE_STYLE_OPTIONS[kind] or {}) do
      options[#options + 1] = {
        label = option.label,
        value = option.value,
        kind = kind,
        active = state.subtitle_style[kind] == option.value,
      }
    end
    return menu_title, options, "style:"
  elseif menu == "audio" then
    local options = {
      { label = "Auto", value = "auto", active = tostring(state.aid) == "auto" or tostring(state.aid) == "no" },
    }
    append_track_rows(options, tracks_by_type("audio"), function(track)
      return tostring(state.aid) == tostring(track.id) or track.selected
    end, 10, "audio tracks")
    options[#options + 1] = { label = "Audio Delay", value = "delay_info", detail = format_audio_delay(state.audio_delay), disabled = true }
    options[#options + 1] = { label = "-0.1s", value = "delay_down", detail = format_audio_delay((tonumber(state.audio_delay) or 0) - 0.1) }
    options[#options + 1] = { label = "+0.1s", value = "delay_up", detail = format_audio_delay((tonumber(state.audio_delay) or 0) + 0.1) }
    options[#options + 1] = { label = "Reset Delay", value = "delay_reset", detail = "0.0s", active = math.abs(tonumber(state.audio_delay) or 0) < 0.005 }
    return "Audio", options, "audio:"
  elseif menu == "video" then
    return "Video", {
      { label = "Aspect Ratio", value = "aspect", detail = video_aspect_label(), action = true, active = state.video_aspect ~= "default" },
      { label = "Zoom", value = "zoom", detail = video_zoom_label(), action = true, active = math.abs(tonumber(state.video_zoom) or 0) >= 0.005 },
      { label = "Renderer", value = "renderer", detail = "MPV", disabled = true },
      { label = "Hardware Decoding", value = "hwdec", detail = "Auto", disabled = true },
      { label = "Reset Video", value = "reset", detail = "Fit / Default", action = true, active = false },
    }, "video:"
  elseif menu == "video_aspect" then
    local options = {}
    for _, option in ipairs(VIDEO_ASPECT_OPTIONS) do
      options[#options + 1] = {
        label = option.label,
        value = option.value,
        detail = option.value == "default" and "Original" or option.property,
        active = state.video_aspect == option.value or state.video_aspect == option.property or video_aspect_label() == option.label,
      }
    end
    return "Aspect Ratio", options, "video_aspect:"
  elseif menu == "video_zoom" then
    local options = {}
    for _, option in ipairs(VIDEO_ZOOM_OPTIONS) do
      options[#options + 1] = {
        label = option.label,
        value = option.value,
        detail = option.detail,
        active = (option.value == "fit" and math.abs(tonumber(state.video_zoom) or 0) < 0.005)
          or (option.value == "fill" and math.abs((tonumber(state.video_zoom) or 0) - 0.12) < 0.005),
      }
    end
    return "Zoom", options, "video_zoom:"
  elseif menu == "playback" then
    local options = {}
    for _, speed in ipairs(SPEEDS) do
      options[#options + 1] = { label = speed_label(speed), value = "speed_" .. tostring(speed), active = math.abs((state.speed or 1) - speed) < 0.03 }
    end
    options[#options + 1] = { label = "Loop Episode", value = "loop", type = "toggle", active = state.loop_file }
    options[#options + 1] = { label = "Remember Speed", value = "remember_speed", type = "toggle", active = state.remember_speed }
    options[#options + 1] = { label = "Reset Playback Settings", value = "reset", detail = "Speed / loop / delay", action = true }
    return "Playback", options, "playback:"
  end
  return "Settings", {}, "settings:"
end

function submenu_title_prefix(menu)
  if menu == "sleep" then return "Sleep timer", "sleep:" end
  if menu == "seek_step" then
    return "Seek step", "seek_step:"
  elseif menu == "speed" then
    return "Playback Speed", "speed:"
  elseif menu == "subs" then
    return "Subtitles", "sub:"
  elseif menu == "appearance" then
    return "Subtitle Appearance", "appearance:"
  elseif starts_with(menu, "appearance_") then
    local kind = menu:gsub("^appearance_", "")
    for _, item in ipairs(SUBTITLE_STYLE_MENU) do
      if item.kind == kind then
        return item.label, "style:"
      end
    end
    return "Subtitle Style", "style:"
  elseif menu == "audio" then
    return "Audio", "audio:"
  elseif menu == "video" then
    return "Video", "video:"
  elseif menu == "video_aspect" then
    return "Aspect Ratio", "video_aspect:"
  elseif menu == "video_zoom" then
    return "Zoom", "video_zoom:"
  elseif menu == "playback" then
    return "Playback", "playback:"
  end
  return "Settings", "settings:"
end

function draw_main_settings(ass, width, height, mouse, s)
  s = math.min(s, width / 500, height / 600)
  local rows = fitted_options(cached_menu_rows("main", build_main_settings_rows), height, s, 57 * s, 56 * s)
  local x1, y1, x2, _, row_h, header_h = panel_bounds(width, height, s, #rows)
  local y2 = y1 + header_h + row_h * #rows + 10 * s
  draw_panel_shell(ass, x1, y1, x2, y2, "Settings", s)
  add_region("settings-panel", x1, y1, x2, y2)
  for i, row in ipairs(rows) do
    local ry1 = y1 + header_h + (i - 1) * row_h
    draw_settings_row(ass, mouse, row.id, x1, ry1, x2, ry1 + row_h, row.icon, row.label, row.value, row.type, row.active, s)
  end
end

function fitted_options(options, height, s, row_h, header_h)
  local max_rows = math.max(5, math.floor((height - 132 * s - header_h) / math.max(1, row_h)))
  local max_options = math.max(3, max_rows - 1)
  if ui.option_menu_name ~= ui.submenu then
    ui.option_menu_name = ui.submenu
    ui.option_menu_scroll = 0
  end
  ui.option_menu_max_scroll = math.max(0, #options - max_options)
  if #options <= max_options then return options end

  if ui.submenu == "subs" then
    local max_scroll = math.max(0, #options - max_options)
    ui.subtitle_menu_scroll = math.floor(clamp(ui.subtitle_menu_scroll or 0, 0, max_scroll))
    local output = {}
    local first = ui.subtitle_menu_scroll + 1
    local last = math.min(#options, first + max_options - 1)
    for i = first, last do
      output[#output + 1] = options[i]
    end
    return output
  end

  -- Every setting remains reachable. A disabled "more items" row previously
  -- hid controls permanently on smaller windows.
  ui.option_menu_scroll = math.floor(clamp(ui.option_menu_scroll or 0, 0, ui.option_menu_max_scroll))
  local output = {}
  for i = ui.option_menu_scroll + 1, math.min(#options, ui.option_menu_scroll + max_options) do
    output[#output + 1] = options[i]
  end
  return output
end

function draw_option_submenu(ass, width, height, mouse, s, title, options, prefix)
  s = math.min(s, width / 500, height / 600)
  local base_row_h = 57 * s
  local base_header_h = 56 * s
  local menu_options = fitted_options(options, height, s, base_row_h, base_header_h)
  local x1, y1, x2, _, row_h, header_h = panel_bounds(width, height, s, #menu_options + 1)
  local y2 = y1 + header_h + row_h * (#menu_options + 1) + 10 * s
  draw_panel_shell(ass, x1, y1, x2, y2, title, s)
  add_region("settings-panel", x1, y1, x2, y2)

  local by1 = y1 + header_h
  local hot = inside(mouse, x1, by1, x2, by1 + row_h)
  local bcy = by1 + row_h / 2
  if hot then rounded_rect(ass, x1 + 10 * s, by1 + 5 * s, x2 - 10 * s, by1 + row_h - 5 * s, 12 * s, C.white, 236) end
  icon_chevron(ass, x1 + 38 * s, bcy, 23 * s, C.secondary, "left")
  draw_text(ass, x1 + 70 * s, bcy + 6 * s, 4, font_px(s, 16, 15, 18), C.white, 34, "Back", false, "Segoe UI")
  add_region("settings:back", x1, by1, x2, by1 + row_h)

  for i, option in ipairs(menu_options) do
    local ry1 = y1 + header_h + i * row_h
    local ry2 = ry1 + row_h
    local cy = (ry1 + ry2) / 2
    local option_hot = inside(mouse, x1, ry1, x2, ry2)
    if option_hot and not option.disabled then rounded_rect(ass, x1 + 10 * s, ry1 + 5 * s, x2 - 10 * s, ry2 - 5 * s, 12 * s, C.white, 236) end
    rect(ass, x1 + 24 * s, ry2 - 1 * s, x2 - 24 * s, ry2, C.line, 236)
    local label_color = option.disabled and C.muted or (option.active and C.accent or C.white)
    local label_alpha = option.disabled and 36 or (option.active and 0 or 28)
    draw_text(ass, x1 + 26 * s, cy + 6 * s, 4, font_px(s, 16, 15, 18), label_color, label_alpha, ellipsize(option.label, 38), false, "Segoe UI")
    local detail = option.detail or option.value_label or ""
    if detail ~= "" then
      draw_text(ass, x2 - 58 * s, cy + 6 * s, 6, font_px(s, 14, 13, 16), option.active and C.accent or C.secondary, option.disabled and 52 or 16, ellipsize(detail, 20), false, "Segoe UI")
    end
    if option.type == "toggle" and not option.disabled then
      draw_toggle(ass, x2 - 44 * s, cy, option.active, s)
    elseif option.action and not option.disabled then
      icon_chevron(ass, x2 - 25 * s, cy, 22 * s, option.active and C.accent or C.secondary, "right")
    elseif option.active and detail == "" then
      icon_check(ass, x2 - 30 * s, cy, 25 * s, C.accent)
    end
    if not option.disabled then
      add_region(prefix .. tostring(option.value), x1, ry1, x2, ry2, option)
    end
  end
  if #options > #menu_options then
    local visible_count = math.max(1, #menu_options)
    local max_scroll = math.max(1, #options - visible_count)
    local scroll = ui.submenu == "subs" and ui.subtitle_menu_scroll or ui.option_menu_scroll
    local ratio = clamp((scroll or 0) / max_scroll, 0, 1)
    local track_y1 = by1 + row_h + 7 * s
    local track_y2 = y2 - 18 * s
    local thumb_h = math.max(24 * s, (track_y2 - track_y1) * visible_count / math.max(visible_count, #options))
    local thumb_y = track_y1 + (track_y2 - track_y1 - thumb_h) * ratio
    rounded_rect(ass, x2 - 13 * s, track_y1, x2 - 9 * s, track_y2, 2 * s, C.white, 224)
    rounded_rect(ass, x2 - 14 * s, thumb_y, x2 - 8 * s, thumb_y + thumb_h, 3 * s, C.accent, 50)
  end
end

function draw_settings_panel(ass, width, height, mouse, s)
  if not ui.settings_open then return end
  if ui.submenu == "main" then
    draw_main_settings(ass, width, height, mouse, s)
  else
    local started = mp.get_time()
    local menu = tostring(ui.submenu or "main")
    local title, prefix = submenu_title_prefix(menu)
    local options = cached_menu_rows(menu, function()
      local _, rows = build_submenu_rows(menu)
      return rows
    end)
    draw_option_submenu(ass, width, height, mouse, s, title, options, prefix)
    submenu_perf("draw:" .. menu, started, "rows=" .. tostring(#options) .. " ass_regions=" .. tostring(#regions))
  end
end

function apply_osd(width, height, text)
  text = text or ""
  if ui.last_ass_text == text and ui.last_ass_width == width and ui.last_ass_height == height then return end
  ui.last_ass_text = text
  ui.last_ass_width = width
  ui.last_ass_height = height
  mp.set_osd_ass(width, height, text)
end

function input_draw_interval(loading, dragging, reason)
  if dragging or (type(reason) == "string" and reason:sub(1, 6) == "mouse-") then return 1 / 60 end
  return loading and 0.04 or 0.066
end

function draw(immediate, reason)
  local now = mp.get_time()
  local width, height = mp.get_osd_size()
  if not width or not height or width <= 0 or height <= 0 then
    width, height = 1280, 720
  end
  local force_minimal_osd = DEBUG_FORCE_MINIMAL_OSD
  local startup_loading = is_loading() or hold_cover_for_first_video_frame()
  local loading = startup_loading or is_buffering()
  local loading_changed = ui.last_render_loading ~= loading
  local skip_intro_range = nil
  local skip_outro_range = nil
  local skip_only = false
  if not force_minimal_osd and not loading and not ui.end_overlay and not ui.visible then
    skip_intro_range = manual_skip_range("intro")
    skip_outro_range = manual_skip_range("outro")
    skip_only = skip_intro_range ~= nil or skip_outro_range ~= nil
  end
  if not force_minimal_osd and not immediate and not loading_changed and not ui.visible and not loading and not ui.pending_draw and not ui.end_overlay and not skip_only and not ui.skip_only_rendered then
    return
  end
  local active_interaction = ui.dragging
  local min_interval = input_draw_interval(loading, ui.dragging, reason)
  if not immediate and not loading_changed and ui.visible and now - (ui.last_draw_at or 0) < min_interval then
    ui.pending_draw = true
    return
  end
  ui.pending_draw = false
  ui.last_render_loading = loading
  ui.last_draw_at = now
  ui.draw_count = (ui.draw_count or 0) + 1
  if ui.visible and not loading and not state.paused and not ui.settings_open and not ui.dragging and not ui.end_overlay and mp.get_time() - ui.last_interaction > AUTO_HIDE_SECONDS then
    ui.visible = false
    skip_intro_range = manual_skip_range("intro")
    skip_outro_range = manual_skip_range("outro")
    skip_only = skip_intro_range ~= nil or skip_outro_range ~= nil
  end
  if not ui.visible and not loading and not ui.end_overlay and not skip_only then
    reset_regions()
    clear_cover_overlay()
    apply_osd(width, height, "")
    ui.skip_only_rendered = false
    return
  end

  reset_regions()
  local mouse = mouse_pos()
  local s = scaled(width, height)
  local ass = assdraw.ass_new()

  if force_minimal_osd then
    draw_smoke_test(ass, width, height, s)
    ui.render_has_run = true
    apply_osd(width, height, ass.text)
    return
  end

  if skip_only then
    clear_cover_overlay()
    draw_manual_skip_buttons(ass, width, height, mouse, s, skip_intro_range, skip_outro_range, true)
    ui.regions_ready = #regions > 0
    ui.region_width = width
    ui.region_height = height
    ui.render_has_run = true
    ui.skip_only_rendered = true
    apply_osd(width, height, ass.text)
    return
  end
  ui.skip_only_rendered = false

  if loading then
    if startup_loading then
      maybe_reload_loading_metadata()
    end
    if not ui.native_loading_osd_cleared then
      safe_commandv("show-text", "", "1")
      ui.native_loading_osd_cleared = true
    end
  else
    ui.native_loading_osd_cleared = false
  end
  local cover_info = update_cover_overlay(startup_loading, width, height, s)
  if loading then
    draw_loading(ass, width, height, s, cover_info)
    -- Buffer telemetry must not dismiss a menu or replace its hit targets
    -- between mouse-down and mouse-up. Menus are always the top input layer.
    if ui.settings_open then draw_settings_panel(ass, width, height, mouse, s) end
    ui.regions_ready = #regions > 0
    ui.region_width = width
    ui.region_height = height
    ui.render_has_run = true
    apply_osd(width, height, ass.text)
    if DEBUG_PERF and now - (ui.last_perf_log or 0) > 1 then
      local draw_ms = (mp.get_time() - now) * 1000
      debug_perf(string.format("draws=%d reason=%s loading=true ass=%d ms=%.1f", ui.draw_count or 0, tostring(reason or ""), #ass.text, draw_ms))
      ui.draw_count = 0
      ui.last_perf_log = now
    end
    return
  end

  -- Top and bottom backgrounds stay completely transparent.
  draw_title_area(ass, width, height, s)
  draw_center_play(ass, width, height, mouse, s)
  draw_timeline(ass, width, height, mouse, s)
  draw_controls(ass, width, height, mouse, s)
  draw_manual_skip_buttons(ass, width, height, mouse, s)
  draw_end_overlay(ass, width, height, mouse, s)
  draw_settings_panel(ass, width, height, mouse, s)

  ui.regions_ready = #regions > 0
  ui.region_width = width
  ui.region_height = height
  ui.render_has_run = true
    apply_osd(width, height, ass.text)
  if DEBUG_PERF and now - (ui.last_perf_log or 0) > 1 then
    local draw_ms = (mp.get_time() - now) * 1000
    debug_perf(string.format("draws=%d reason=%s visible=%s menu=%s ass=%d hitboxes=%d ms=%.1f", ui.draw_count or 0, tostring(reason or ""), tostring(ui.visible), tostring(ui.submenu), #ass.text, #regions, draw_ms))
    ui.draw_count = 0
    ui.last_perf_log = now
  end
end

function redraw_for_input()
  local width, height = mp.get_osd_size()
  if ui.regions_ready
    and #regions > 0
    and ui.region_width == width
    and ui.region_height == height then
    local region, mouse = hit_region()
    if region then return region, mouse end
  end
  show_overlay()
  draw(true, "input")
  return hit_region()
end

function update_property(name, value, should_show)
  state[name] = value
  if should_show then show_overlay() end
  draw(false, "property:" .. tostring(name))
end

function note_explicit_seek(target)
  ui.last_video_position = math.max(0, tonumber(target) or 0)
  ui.playhead_last_advance_at = mp.get_time()
  -- A user seek during a retry replaces the resume checkpoint. Do not let
  -- recovery jump back to its older position, especially after a backward seek.
  if ui.recovery_attempt and ui.recovery_attempt.kind ~= "backup" then
    ui.recovery_attempt.position = ui.last_video_position
    ui.recovery_attempt.started_at = mp.get_time()
    ui.recovery_attempt.restart_seen = false
  end
end

function set_seek_from_mouse(mouse, final, preview_command)
  if state.duration <= 0 then return end
  local width, height = mp.get_osd_size()
  local s = scaled(width, height)
  local ratio = mouse and timeline_ratio(mouse, width, height, s) or current_drag_ratio()
  if ratio == nil then return end
  ratio = set_drag_preview_ratio(ratio)
  local target = ratio * state.duration
  if final then
    note_explicit_seek(target)
    mp.commandv("seek", tostring(target), "absolute+exact")
    state.pos = target
    clear_drag_preview()
  elseif preview_command and drag_command_due(SEEK_DRAG_COMMAND_INTERVAL, false) then
    mp.commandv("seek", tostring(target), "absolute+keyframes")
  end
end

function set_volume_from_mouse(mouse, final, preview_command)
  local width, height = mp.get_osd_size()
  local s = scaled(width, height)
  local ratio = mouse and volume_ratio(mouse, width, height, s) or current_drag_ratio()
  if ratio == nil then return end
  ratio = set_drag_preview_ratio(ratio)
  local next_volume = clamp(math.floor(ratio * 130 + 0.5), 0, 130)
  state.volume = next_volume
  if final or (preview_command and drag_command_due(VOLUME_DRAG_COMMAND_INTERVAL, false)) then
    mp.commandv("set", "volume", tostring(next_volume))
    if state.muted and next_volume > 0 then mp.commandv("set", "mute", "no") end
  end
  if final then
    emit_player_setting_changed("volume", tostring(next_volume))
    if state.muted and next_volume > 0 then emit_player_setting_changed("muted", "false") end
    clear_drag_preview()
  end
end

function toggle_subtitles()
  if state.sid == "no" then
    local subs = tracks_by_type("sub")
    if #subs > 0 then
      safe_set_property("sid", tostring(subs[1].id))
      safe_set_property_bool("sub-visibility", true)
    end
  else
    safe_set_property_bool("sub-visibility", not state.sub_visible)
  end
end

function cycle_speed()
  local current = tonumber(state.speed) or 1
  local next_speed = 1
  for i, speed in ipairs(SPEEDS) do
    if math.abs(current - speed) < 0.03 then
      next_speed = SPEEDS[(i % #SPEEDS) + 1]
      break
    end
  if current < speed then
      next_speed = speed
      break
    end
  end
  safe_set_property_number("speed", next_speed)
end

function seek_relative(seconds)
  local amount = tonumber(seconds) or 0
  if amount == 0 then return end
  local duration = tonumber(state.duration) or 0
  if duration > 0 then
    local target = clamp((tonumber(state.pos) or 0) + amount, 0, math.max(0, duration - 0.1))
    note_explicit_seek(target)
    safe_commandv("seek", tostring(target), "absolute+exact")
  else
    safe_commandv("seek", tostring(amount), "relative")
  end
end

function perform_skip_range(range, mode, close_menu)
  if not range or not valid_skip_range(range.start_time, range.end_time) then return false end
  local pos = tonumber(state.pos) or 0
  local duration = tonumber(state.duration) or 0
  local target = range.end_time
  if duration > 0 then target = clamp(target, 0, math.max(0, duration - 0.1)) end
  if target <= pos + 0.2 then return false end

  local entry = skip_state_for(range.key)
  if not entry then return false end
  if mode == "auto" then
    entry.auto_skipped = true
  else
    entry.clicked = true
    entry.dismissed = true
  end

  if range.kind == "outro" then
    ui.skip_outro_applied = true
  else
    ui.skip_intro_applied = true
  end

  note_explicit_seek(target)
  safe_commandv("seek", tostring(target), "absolute+exact")
  msg.info(string.format(
    "[StreamNyaa Lua] %s skipped %s: %.1f -> %.1f source=%s",
    mode == "auto" and "Auto" or "Manual",
    range.kind == "outro" and "ending" or "opening",
    pos,
    target,
    tostring(range.source)
  ))

  if close_menu ~= false then
    ui.settings_open = false
    ui.submenu = "main"
  end
  return true
end

function skip_intro(close_menu)
  local range = manual_strict_skip_range("intro", tonumber(state.pos) or 0)
  if not perform_skip_range(range, "manual", close_menu) then
    safe_commandv("show-text", "No intro marker found for this file.", "1700")
  end
end

function skip_outro(close_menu)
  local range = manual_strict_skip_range("outro", tonumber(state.pos) or 0)
  if not perform_skip_range(range, "manual", close_menu) then
    safe_commandv("show-text", "No outro marker found for this file.", "1700")
  end
end

function maybe_auto_skip_intro()
  if not state.skip_intro then return end
  local range = skip_range_for_position("intro", tonumber(state.pos) or 0, false)
  if not can_auto_skip_now(range) then return end
  local entry = skip_state_for(range.key)
  if entry and not entry.auto_skipped and not entry.clicked then
    perform_skip_range(range, "auto", false)
    show_overlay()
  end
end

function maybe_auto_skip_outro()
  if not state.skip_outro then return end
  local range = skip_range_for_position("outro", tonumber(state.pos) or 0, false)
  if not can_auto_skip_now(range) then return end
  local entry = skip_state_for(range.key)
  if entry and not entry.auto_skipped and not entry.clicked then
    perform_skip_range(range, "auto", false)
    show_overlay()
  end
end

function set_window_mode(mode)
  if mode == "mini" then
    if state.mini_player then return end
    local width, height = mp.get_osd_size()
    ui.window_before_mini = {
      fullscreen = mp.get_property_native("fullscreen", false),
      maximized = mp.get_property_native("window-maximized", false),
      ontop = mp.get_property_native("ontop", false),
      geometry = string.format("%dx%d", width, height),
    }
    state.mini_player = true
    safe_set_property("fullscreen", "no")
    safe_set_property("window-maximized", "no")
    safe_set_property("ontop", "yes")
    safe_set_property("geometry", MINI_GEOMETRY)
  else
    if not state.mini_player then return end
    local previous = ui.window_before_mini or { maximized = true }
    state.mini_player = false
    safe_set_property("ontop", previous.ontop and "yes" or "no")
    if previous.geometry then safe_set_property("geometry", previous.geometry) end
    safe_set_property("window-maximized", previous.maximized and "yes" or "no")
    safe_set_property("fullscreen", previous.fullscreen and "yes" or "no")
    ui.window_before_mini = nil
  end
  show_overlay()
end

function toggle_mini_player()
  if state.mini_player then
    set_window_mode("normal")
  else
    set_window_mode("mini")
  end
end

function update_demuxer_cache(value)
  local cache_end = 0
  local cache_duration = nil
  local demuxer_percent = nil
  local underrun = false
  if type(value) == "table" then
    if tonumber(value["cache-end"]) then
      cache_end = tonumber(value["cache-end"]) or 0
    end
    cache_duration = tonumber(value["cache-duration"]) or tonumber(value["fw-duration"])
    demuxer_percent = tonumber(value["cache-percent"]) or tonumber(value["buffering-percent"])
    underrun = value["underrun"] == true
    local ranges = value["seekable-ranges"]
    if type(ranges) == "table" then
      cache_end = 0
      for _, range in ipairs(ranges) do
        if type(range) == "table" and tonumber(range["start"]) and tonumber(range["end"])
          and tonumber(range["start"]) <= (tonumber(state.pos) or 0) + 0.1
          and tonumber(range["end"]) >= (tonumber(state.pos) or 0) then
          cache_end = math.max(cache_end, tonumber(range["end"]) or 0)
        end
      end
    end
  end
  state.cache_end = cache_end
  state.demuxer_state_duration = cache_duration
  state.demuxer_underrun = underrun
  if underrun and clean_buffering_percent(demuxer_percent) then
    state.demuxer_buffering_percent = clamp(demuxer_percent, 0, 100)
  else
    state.demuxer_buffering_percent = nil
  end
  log_buffering_transition()
  update_stall_watchdog_timer()
  if not ui.settings_open or is_loading() or is_buffering() then
    draw(false, "demuxer-cache")
  end
end

function set_release_subtitle_delay(seconds)
  seconds = clamp(tonumber(seconds) or 0, -120, 120)
  state.sub_delay = seconds
  player_meta.subtitleOffsetSeconds = seconds
  safe_set_property_number("sub-delay", seconds)
  local key = tostring(player_meta.subtitleOffsetKey or "")
  if key:match("^subtitleOffset%.[a-fA-F0-9]+%.%d+$") then
    emit_player_setting_changed(key, tostring(seconds))
  end
end

function activate_region(region, mouse)
  if not region then
    debug_input("activate none; closing settings")
    ui.dragging = nil
    clear_drag_preview()
    ui.mouse_down_region = nil
    ui.settings_open = false
    ui.submenu = "main"
    update_stall_watchdog_timer()
    return
  end

  local id = region.id
  debug_input("activate=" .. tostring(id))
  if id == "settings-panel" then return end
  if id ~= "settings"
    and not starts_with(id, "settings:")
    and not starts_with(id, "speed:")
    and not starts_with(id, "seek_step:")
    and not starts_with(id, "sub:")
    and not starts_with(id, "appearance:")
    and not starts_with(id, "style:")
    and not starts_with(id, "audio:")
    and not starts_with(id, "video:")
    and not starts_with(id, "video_aspect:")
    and not starts_with(id, "video_zoom:")
    and not starts_with(id, "playback:") then
    ui.settings_open = false
    ui.submenu = "main"
  end

  if id == "end_next_episode" then
    request_next_episode("manual")
  elseif id == "end_replay" then
    hide_end_overlay(true)
    ui.eof_handled_key = ""
    ui.last_next_episode_request_key = ""
    note_explicit_seek(0)
    safe_commandv("seek", "0", "absolute+exact")
    safe_set_property_bool("pause", false)
    settings_notice("Replaying episode")
  elseif id == "end_close" then
    hide_end_overlay(true)
    settings_notice("Episode finished")
  elseif id == "recovery_retry" then
    if not request_same_source_recovery("manual") then
      -- Metadata may have failed before MPV received a stream URL. Ask the
      -- app to retry the selected release rather than reloading a placeholder.
      ui.recovery_attempt = nil
      request_backup_source_recovery("retry")
    end
    ui.startup_stream_actions_visible = false
    show_overlay()
  elseif id == "recovery_backup" then
    ui.recovery_attempt = nil
    ui.recovery_terminal = false
    request_backup_source_recovery()
    ui.stall_actions_visible = false
    ui.startup_stream_actions_visible = false
    settings_notice("Requesting a same-episode backup source...")
  elseif id == "play" or id == "center_play" or id == "center_toggle" then
    if ui.end_overlay then hide_end_overlay(true) end
    mp.commandv("cycle", "pause")
  elseif id == "back" then
    seek_relative(-seek_step_seconds())
  elseif id == "forward" then
    seek_relative(seek_step_seconds())
  elseif id == "next_episode" then
    request_next_episode("manual")
  elseif id == "manual_skip_intro" or id == "manual_skip_outro" then
    local data = region.data or {}
    local kind = tostring(data.kind or (id == "manual_skip_outro" and "outro" or "intro"))
    local range = {
      kind = kind,
      start_time = tonumber(data.start_time),
      end_time = tonumber(data.end_time),
      source = tostring(data.source or "button"),
      key = tostring(data.key or ""),
      high_confidence = true,
    }
    if range.key == "" then range.key = skip_range_key(kind, range.start_time, range.end_time) end
    perform_skip_range(range, "manual", false)
  elseif id == "mute" then
    mp.commandv("cycle", "mute")
    mp.add_timeout(0.05, function()
      emit_player_setting_changed("muted", mp.get_property_bool("mute") and "true" or "false")
    end)
  elseif id == "seek" then
    set_seek_from_mouse(mouse, true)
  elseif id == "volume" then
    set_volume_from_mouse(mouse, true)
  elseif id == "subs" then
    toggle_subtitles()
  elseif id == "settings" then
    ui.settings_open = not ui.settings_open
    ui.submenu = "main"
  elseif id == "speed" then
    ui.settings_open = true
    ui.submenu = "speed"
  elseif id == "mini" then
    toggle_mini_player()
  elseif id == "fullscreen" or id == "settings:fullscreen" then
    mp.commandv("cycle", "fullscreen")
  elseif id == "settings:back" then
    if starts_with(ui.submenu, "appearance_") then
      ui.submenu = "appearance"
    elseif starts_with(ui.submenu, "video_") then
      ui.submenu = "video"
    else
      ui.submenu = "main"
    end
  elseif id == "settings:speed" then
    ui.submenu = "speed"
  elseif id == "settings:subs" then
    ui.submenu = "subs"
  elseif id == "settings:appearance" then
    ui.submenu = "appearance"
  elseif id == "settings:audio" then
    ui.submenu = "audio"
  elseif id == "settings:video" then
    ui.submenu = "video"
  elseif id == "settings:playback" then
    ui.submenu = "playback"
  elseif id == "settings:download" or id == "download" then
    safe_commandv("script-message", "streamnyaa-download-request")
  elseif id == "settings:seek_step" then
    ui.submenu = "seek_step"
  elseif id == "settings:sleep" then
    ui.submenu = "sleep"
  elseif starts_with(id, "sleep:") then
    set_sleep_timer(region.data and region.data.value)
    ui.settings_open = true
    ui.submenu = "main"
  elseif starts_with(id, "seek_step:") then
    apply_player_preference("seekStepSeconds", region.data and region.data.value)
    emit_player_setting_changed("seekStepSeconds", tostring(seek_step_seconds()))
    ui.settings_open = true
    ui.submenu = "main"
  elseif id == "settings:autoplay" then
    state.autoplay = not state.autoplay
    safe_commandv("script-message", "streamnyaa-auto-next-changed", state.autoplay and "true" or "false")
    emit_player_setting_changed("autoNextEpisode", state.autoplay and "true" or "false")
    mark_menu_dirty("main")
    settings_notice(state.autoplay and "Auto next episode on" or "Auto next episode off")
  elseif id == "settings:skip" then
    state.skip_intro = not state.skip_intro
    if not state.skip_intro then reset_skip_range_state() end
    emit_player_setting_changed("autoSkipIntro", state.skip_intro and "true" or "false")
    mark_menu_dirty("main")
    settings_notice(state.skip_intro and "Auto skip intro on" or "Auto skip intro off")
  elseif id == "settings:skip_outro" then
    state.skip_outro = not state.skip_outro
    if not state.skip_outro then reset_skip_range_state() end
    emit_player_setting_changed("autoSkipOutro", state.skip_outro and "true" or "false")
    mark_menu_dirty("main")
    settings_notice(state.skip_outro and "Auto skip outro on" or "Auto skip outro off")
  elseif id == "settings:mini" then
    toggle_mini_player()
  elseif starts_with(id, "speed:") then
    local selected_speed = tonumber(region.data and region.data.value) or 1
    safe_set_property_number("speed", selected_speed)
    emit_player_setting_changed("playbackSpeed", tostring(selected_speed))
    ui.submenu = "main"
  elseif starts_with(id, "sub:") then
    local value = region.data and region.data.value or "no"
    if tostring(value) == "import" then
      msg.info("Requesting external subtitle import from StreamNyaa desktop shell")
      settings_notice("Choose a subtitle file...")
      request_external_subtitle_import()
      ui.submenu = "subs"
    elseif tostring(value) == "delay_down" then
      set_release_subtitle_delay((tonumber(state.sub_delay) or 0) - 0.1)
      ui.submenu = "subs"
    elseif tostring(value) == "delay_up" then
      set_release_subtitle_delay((tonumber(state.sub_delay) or 0) + 0.1)
      ui.submenu = "subs"
    elseif tostring(value) == "delay_reset" then
      set_release_subtitle_delay(0)
      ui.submenu = "subs"
    elseif tostring(value) == "no" then
      safe_set_property("sid", "no")
      safe_set_property_bool("sub-visibility", false)
      ui.submenu = "main"
    else
      safe_set_property("sid", tostring(value))
      safe_set_property_bool("sub-visibility", true)
      ui.submenu = "main"
    end
  elseif starts_with(id, "appearance:") then
    local value = tostring(region.data and region.data.value or "")
    if value == "reset" then
      reset_subtitle_style()
      emit_subtitle_style_preferences()
      settings_notice("Subtitle style reset")
      ui.submenu = "appearance"
    elseif SUBTITLE_STYLE_OPTIONS[value] then
      ui.submenu = "appearance_" .. value
    else
      ui.submenu = "appearance"
    end
  elseif starts_with(id, "style:") then
    local kind = region.data and region.data.kind
    local value = region.data and region.data.value
    if kind and value and SUBTITLE_STYLE_OPTIONS[kind] then
      state.subtitle_style[kind] = value
      state.subtitle_style.custom = true
      if apply_subtitle_style() then
        settings_notice("Subtitle style updated")
      else
        settings_notice("Subtitle style updated with limited MPV support")
      end
      local preference_key = subtitle_style_preference_key(kind)
      if preference_key then emit_player_setting_changed(preference_key, tostring(value)) end
      emit_player_setting_changed("subtitleStyle.custom", "true")
      ui.submenu = "appearance"
    end
  elseif starts_with(id, "audio:") then
    local value = region.data and region.data.value or "auto"
    if tostring(value) == "delay_down" then
      safe_set_property_number("audio-delay", (tonumber(state.audio_delay) or 0) - 0.1)
      ui.submenu = "audio"
    elseif tostring(value) == "delay_up" then
      safe_set_property_number("audio-delay", (tonumber(state.audio_delay) or 0) + 0.1)
      ui.submenu = "audio"
    elseif tostring(value) == "delay_reset" then
      safe_set_property_number("audio-delay", 0)
      ui.submenu = "audio"
    elseif tostring(value) == "delay_info" then
      ui.submenu = "audio"
    else
      safe_set_property("aid", tostring(value))
      ui.submenu = "main"
    end
  elseif starts_with(id, "video:") then
    local value = tostring(region.data and region.data.value or "")
    if value == "aspect" then
      ui.submenu = "video_aspect"
    elseif value == "zoom" then
      ui.submenu = "video_zoom"
    elseif value == "reset" then
      apply_video_aspect("default")
      reset_video_zoom()
      settings_notice("Video settings reset")
      ui.submenu = "video"
    else
      settings_notice("This video option is managed automatically by MPV")
      ui.submenu = "video"
    end
  elseif starts_with(id, "video_aspect:") then
    local value = tostring(region.data and region.data.value or "default")
    apply_video_aspect(value)
    ui.submenu = "video"
  elseif starts_with(id, "video_zoom:") then
    local value = tostring(region.data and region.data.value or "fit")
    apply_video_zoom(value)
    ui.submenu = "video"
  elseif starts_with(id, "playback:") then
    local value = tostring(region.data and region.data.value or "")
    if starts_with(value, "speed_") then
      local speed = tonumber(value:gsub("^speed_", "")) or 1
      safe_set_property_number("speed", speed)
      emit_player_setting_changed("playbackSpeed", tostring(speed))
      settings_notice("Playback speed: " .. speed_label(speed))
    elseif value == "loop" then
      state.loop_file = not state.loop_file
      safe_set_property("loop-file", state.loop_file and "inf" or "no")
      settings_notice(state.loop_file and "Loop episode on" or "Loop episode off")
    elseif value == "remember_speed" then
      state.remember_speed = not state.remember_speed
      emit_player_setting_changed("rememberSpeed", state.remember_speed and "true" or "false")
      settings_notice(state.remember_speed and "Remember speed on" or "Remember speed off")
    elseif value == "reset" then
      reset_playback_settings()
      emit_player_setting_changed("playbackSpeed", "1")
      emit_player_setting_changed("rememberSpeed", state.remember_speed and "true" or "false")
    end
    ui.submenu = "playback"
  end
  update_stall_watchdog_timer()
end

function handle_mouse_move()
  note_direct_interaction()
  show_overlay()
  local mouse = mouse_pos()
  if not mouse and ui.dragging then
    draw_drag("mouse-drag-wait")
    return
  end
  if ui.dragging == "seek" then
    if mouse and (math.abs(mouse.x - (ui.drag_start_x or 0)) > 2 or math.abs(mouse.y - (ui.drag_start_y or 0)) > 2) then
      ui.drag_has_moved = true
    end
    set_seek_from_mouse(mouse, false, true)
    draw_drag("mouse-drag-seek")
    return
  elseif ui.dragging == "volume" then
    if mouse and (math.abs(mouse.x - (ui.drag_start_x or 0)) > 2 or math.abs(mouse.y - (ui.drag_start_y or 0)) > 2) then
      ui.drag_has_moved = true
    end
    set_volume_from_mouse(mouse, false, true)
    draw_drag("mouse-drag-volume")
    return
  end
  if ui.settings_open then
    local width, height = mp.get_osd_size()
    if not (ui.visible and ui.regions_ready and #regions > 0 and ui.region_width == width and ui.region_height == height) then
      draw(true, "mouse-move-layout")
    end
    local region = hit_region()
    local hover_id = region and tostring(region.id or "") or ""
    if hover_id ~= ui.hover_region_id then
      ui.hover_region_id = hover_id
      draw(true, "mouse-hover")
    end
    return
  end
  draw(false, "mouse-move")
end

function handle_mouse_down()
  note_direct_interaction()
  local region, mouse = redraw_for_input()
  debug_input("pointer=" .. tostring(mouse and mouse.x) .. "," .. tostring(mouse and mouse.y))
  debug_input("down target=" .. tostring(region and region.id or "none"))
  ui.dragging = nil
  clear_drag_preview()
  ui.mouse_down_region = region
  local width, height = mp.get_osd_size()
  ui.mouse_down_layout = { width = width, height = height, menu = ui.settings_open, submenu = ui.submenu, ended = ui.end_overlay }
  if region and region.id == "seek" then
    begin_drag("seek", mouse)
    set_seek_from_mouse(mouse, false, false)
  elseif region and region.id == "volume" then
    begin_drag("volume", mouse)
    set_volume_from_mouse(mouse, false, false)
  end
  draw(true, "mouse-down")
end

function handle_mouse_up()
  local region, mouse = redraw_for_input()
  debug_input("up target=" .. tostring(region and region.id or "none") .. " dragging=" .. tostring(ui.dragging or "none"))
  if ui.dragging == "seek" then
    set_seek_from_mouse(mouse, true, false)
    debug_input("finish seek drag")
  elseif ui.dragging == "volume" then
    set_volume_from_mouse(mouse, true, false)
    debug_input("finish volume drag")
  else
    local down_region = ui.mouse_down_region
    -- A release over a different control cancels instead of firing that control.
    local layout = ui.mouse_down_layout
    local width, height = mp.get_osd_size()
    local same_layout = layout and layout.width == width and layout.height == height
      and layout.menu == ui.settings_open and layout.submenu == ui.submenu and layout.ended == ui.end_overlay
    -- A buffering repaint can temporarily remove toolbar/skip targets. Keep
    -- the pressed control only while the pointer and interaction layer agree.
    local retained = down_region and not region and same_layout
      and inside(mouse, down_region.x1, down_region.y1, down_region.x2, down_region.y2)
    if down_region and same_layout and ((region and down_region.id == region.id) or retained) then
      activate_region(region or down_region, mouse)
    elseif not down_region and not region then
      activate_region(nil, mouse)
    end
  end
  ui.dragging = nil
  clear_drag_preview()
  ui.mouse_down_region = nil
  ui.mouse_down_layout = nil
  draw(true, "mouse-up")
end

function handle_mouse_press(event)
  local ev = type(event) == "table" and event.event or "press"
  debug_input("mouse event=" .. tostring(ev) .. " overlay=" .. tostring(ui.visible) .. " menu=" .. tostring(ui.submenu) .. " drag=" .. tostring(ui.dragging or "none"))
  if (type(event) == "table" and event.canceled) or ev == "cancel" then
    ui.dragging = nil
    clear_drag_preview()
    ui.mouse_down_region = nil
    ui.mouse_down_layout = nil
    return
  end
  if ev == "down" then
    show_overlay()
    handle_mouse_down()
  elseif ev == "up" then
    handle_mouse_up()
  elseif ev == "press" or ev == nil then
    local region, mouse = redraw_for_input()
    debug_input("press target=" .. tostring(region and region.id or "none"))
    activate_region(region, mouse)
    draw(true, "mouse-press")
  elseif ev == "double" then
    handle_double_click({ event = "press" })
  end
end

function handle_wheel(delta)
  note_direct_interaction()
  show_overlay()
  if ui.settings_open then
    if ui.submenu == "subs" then
      ui.subtitle_menu_scroll = math.max(0, (ui.subtitle_menu_scroll or 0) + delta)
    else
      ui.option_menu_scroll = clamp((ui.option_menu_scroll or 0) + delta, 0, ui.option_menu_max_scroll or 0)
    end
    draw(true, delta > 0 and "wheel-settings-down" or "wheel-settings-up")
    return
  end
  safe_commandv("add", "volume", delta < 0 and "5" or "-5")
  mp.add_timeout(0.06, function()
    emit_player_setting_changed("volume", tostring(mp.get_property_number("volume") or state.volume or 100))
  end)
  draw(true, delta < 0 and "wheel-volume-up" or "wheel-volume-down")
end

function bind(key, name, fn)
  local ok = pcall(function()
    mp.add_forced_key_binding(key, name, fn, { complex = true })
  end)
  if not ok then
    mp.add_forced_key_binding(key, name, fn)
  end
end

function bind_key(key, name, fn)
  local ok = pcall(function()
    mp.add_forced_key_binding(key, name, fn)
  end)
  if not ok then
    mp.add_key_binding(key, name, fn)
  end
end

function close_menu_or_overlay()
  note_direct_interaction()
  ui.dragging = nil
  clear_drag_preview()
  ui.mouse_down_region = nil
  if ui.end_overlay then
    hide_end_overlay(true)
    draw(true, "escape-end-overlay")
    return
  end
  if ui.settings_open then
    if starts_with(ui.submenu, "appearance_") then
      ui.submenu = "appearance"
    elseif ui.submenu ~= "main" then
      ui.submenu = "main"
    else
      ui.settings_open = false
    end
  elseif mp.get_property_native("fullscreen", state.fullscreen) then
    safe_set_property("fullscreen", "no")
    show_overlay()
    draw(true, "escape-fullscreen")
    return
  else
    ui.visible = false
    reset_regions()
    local width, height = mp.get_osd_size()
    apply_osd(width or 1280, height or 720, "")
  end
  draw(true, "escape")
end

mp.observe_property("duration", "number", function(_, value)
  state.duration = value or 0
  if has_playable_media() then
    ui.eof_candidate_key = current_media_key()
    begin_startup_stream_watchdog(state.path)
  end
  show_overlay()
  draw(true, "duration")
end)
mp.observe_property("time-pos", "number", function(_, value)
  local previous_pos = tonumber(state.pos) or 0
  state.pos = value or 0
  if has_playable_media() and value ~= nil and not state.idle then
    ui.last_video_position = state.pos
  end
  -- Property notifications can arrive after playback-restart, particularly
  -- when replacing the loading image. Confirm video independently of that event.
  if not state.has_started_playback and value ~= nil and not state.seeking
    and not state.paused and not state.paused_for_cache
    and not is_placeholder_media() and state.path ~= ""
    and state.pos > previous_pos + 0.01 then
    local video = mp.get_property_native("video-out-params")
    if mp.get_property_native("vo-configured", false) and type(video) == "table"
      and (tonumber(video.w) or 0) > 0 and (tonumber(video.h) or 0) > 0 then
      state.has_started_playback = true
      ui.loading_override_until = 0
      begin_first_video_frame_handoff()
      safe_set_property("user-data/streamnyaa/has_started", "true")
      reset_startup_stream_watchdog(true)
      draw(true, "advancing-first-video-frame")
    end
  end
  if has_playable_media() and state.has_started_playback and not state.seeking and state.pos > previous_pos + 0.05 then
    ui.last_video_position = state.pos
    ui.playhead_last_advance_at = mp.get_time()
    local video = mp.get_property_native("video-out-params")
    if ui.recovery_terminal and not state.idle and not state.paused_for_cache
      and mp.get_property_native("vo-configured", false)
      and type(video) == "table" and (tonumber(video.w) or 0) > 0 and (tonumber(video.h) or 0) > 0 then
      ui.recovery_terminal = false
      ui.recovery_attempt = nil
      ui.stall_actions_visible = false
      ui.startup_stream_actions_visible = false
      reset_stall_watchdog(true)
      safe_set_property("user-data/streamnyaa/recovery_stage", "playing")
      draw(true, "video-recovered")
    end
    if ui.recovery_attempt and ui.recovery_attempt.restart_seen
      and state.pos > ui.recovery_attempt.position + 0.25 then
      ui.recovery_attempt = nil
      ui.recovery_terminal = false
      reset_stall_watchdog(true)
      msg.info("[StreamNyaa Lua] Recovery confirmed by advancing video")
    end
    reset_startup_stream_watchdog(true)
    ui.eof_candidate_key = current_media_key()
    ui.loading_override_until = 0
  end
  maybe_auto_skip_intro()
  maybe_auto_skip_outro()
  wake_manual_skip_buttons()
  maybe_handle_episode_end()
  if not ui.settings_open then
    draw(false, "time-pos")
  end
  update_stall_watchdog_timer()
end)
mp.observe_property("pause", "bool", function(_, value)
  if value == false then ui.sleep_expired = false end
  update_property("paused", value or false, true)
  update_stall_watchdog_timer()
end)
mp.observe_property("seeking", "bool", function(_, value)
  update_property("seeking", value or false, true)
  update_stall_watchdog_timer()
end)
mp.observe_property("volume", "number", function(_, value) update_property("volume", value or 100, false) end)
mp.observe_property("mute", "bool", function(_, value) update_property("muted", value or false, false) end)
mp.observe_property("speed", "number", function(_, value)
  mark_menus_dirty("main", "speed", "playback")
  update_property("speed", value or 1, false)
end)
mp.observe_property("idle-active", "bool", function(_, value) update_property("idle", value or false, true); update_stall_watchdog_timer() end)
mp.observe_property("core-idle", "bool", function(_, value) update_property("core_idle", value or false, true); update_stall_watchdog_timer() end)
mp.observe_property("paused-for-cache", "bool", function(_, value)
  update_property("paused_for_cache", value or false, true)
  log_buffering_transition()
  update_stall_watchdog_timer()
end)
mp.observe_property("fullscreen", "bool", function(_, value)
  if value then
    state.mini_player = false
  end
  mark_menu_dirty("main")
  update_property("fullscreen", value or false, false)
end)
mp.observe_property("path", "string", function(_, value)
  local next_path = value or ""
  if next_path ~= state.path then
    local recovering_same_file = ui.recovery_attempt
      and (next_path == "" or next_path == ui.recovery_attempt.path)
    reset_skip_range_state()
    reset_end_overlay_state()
    reset_buffering_state()
    reset_stall_watchdog(false)
    if not recovering_same_file then
      ui.source_recovery_count = 0
      ui.recovery_attempt = nil
      ui.recovery_terminal = false
      ui.last_video_position = 0
      ui.playhead_last_advance_at = mp.get_time()
    end
    ui.marker_log_key = ""
    ui.chapter_state_key = ""
    ui.anim_started = mp.get_time()
    if not recovering_same_file then state.has_started_playback = false end
    ui.first_video_frame_cover_until = 0
    safe_set_property("user-data/streamnyaa/has_started", "false")
    ui.loading_override_until = mp.get_time() + 2.5
    if is_placeholder_path(next_path) then
      ui.last_startup_loading_percent = 0
      reset_startup_stream_watchdog(true)
    elseif next_path ~= "" then
      begin_startup_stream_watchdog(next_path)
    else
      reset_startup_stream_watchdog(true)
    end
  end
  if next_path ~= "" and not is_placeholder_path(next_path) then ui.last_video_path = next_path end
  update_property("path", next_path, true)
  update_stall_watchdog_timer()
end)
mp.observe_property("filename", "string", function(_, value) update_property("filename", value or "", false) end)
mp.observe_property("media-title", "string", function(_, value) update_property("title", value or "", true) end)
mp.observe_property("cache-buffering-state", "number", function(_, value)
  local percent = tonumber(value)
  state.cache_percent = percent or 0
  if clean_buffering_percent(percent) ~= nil then
    state.cache_buffering_active = percent < 100
    state.cache_buffering_percent = clamp(percent, 0, 100)
  else
    state.cache_buffering_active = false
    state.cache_buffering_percent = nil
  end
  log_buffering_transition()
  update_stall_watchdog_timer()
  if not ui.settings_open or is_loading() or is_buffering() then
    draw(false, "cache-buffering")
  end
end)
mp.observe_property("demuxer-cache-state", "native", function(_, value) update_demuxer_cache(value) end)
mp.observe_property("demuxer-cache-duration", "number", function(_, value)
  local duration = tonumber(value)
  if duration and duration >= 0 then
    state.demuxer_cache_duration = duration
  else
    state.demuxer_cache_duration = nil
  end
  if is_midplayback_buffering() then draw(false, "demuxer-cache-duration") end
end)
mp.observe_property("chapter-list", "native", function(_, value)
  state.chapters = value or {}
  local chapter_key = tostring(#(state.chapters or {})) .. ":" .. tostring(math.floor(tonumber(state.duration) or 0))
  if chapter_key ~= ui.chapter_state_key then
    reset_skip_range_state()
    ui.chapter_state_key = chapter_key
  end
  log_op_ed_markers()
  if not ui.settings_open then draw(false, "chapter-list") end
end)
mp.observe_property("sid", "native", function(_, value)
  state.sid = value or "no"
  mark_menus_dirty("main", "subs")
  draw(ui.settings_open, "sid")
end)
mp.observe_property("aid", "native", function(_, value)
  state.aid = value or "auto"
  mark_menus_dirty("main", "audio")
  draw(ui.settings_open, "aid")
end)
mp.observe_property("sub-visibility", "bool", function(_, value)
  state.sub_visible = value ~= false
  mark_menus_dirty("main", "subs")
  draw(ui.settings_open, "sub-visibility")
end)
mp.observe_property("sub-delay", "number", function(_, value)
  state.sub_delay = value or 0
  mark_menus_dirty("main", "subs")
  draw(ui.settings_open, "sub-delay")
end)
mp.observe_property("audio-delay", "number", function(_, value)
  state.audio_delay = value or 0
  mark_menus_dirty("main", "audio")
  draw(ui.settings_open, "audio-delay")
end)
mp.observe_property("video-aspect-override", "string", function(_, value)
  local aspect = tostring(value or "")
  if aspect == "" or aspect == "-1" or aspect == "no" then
    state.video_aspect = "default"
  else
    state.video_aspect = aspect
  end
  mark_menus_dirty("main", "video", "video_aspect")
  draw(ui.settings_open, "video-aspect")
end)
mp.observe_property("video-zoom", "number", function(_, value)
  state.video_zoom = value or 0
  mark_menus_dirty("main", "video", "video_zoom")
  draw(ui.settings_open, "video-zoom")
end)
mp.observe_property("loop-file", "native", function(_, value)
  state.loop_file = loop_file_enabled(value)
  mark_menus_dirty("main", "playback")
  draw(ui.settings_open, "loop-file")
end)
mp.observe_property("track-list", "native", function(_, value)
  state.tracks = value or {}
  refresh_track_cache(state.tracks)
  draw(ui.settings_open, "track-list")
end)

bind("MBTN_LEFT", "streamnyaa-click", handle_mouse_press)
function handle_double_click(event)
  local ev = type(event) == "table" and event.event or "press"
  debug_input("double event=" .. tostring(ev))
  if type(event) == "table" and event.canceled then
    ui.double_click_pending = nil
    handle_mouse_press(event)
    return
  end
  if ev == "down" then
    local region = redraw_for_input()
    ui.double_click_pending = (region or ui.settings_open) and "control" or "video"
    if ui.double_click_pending == "control" then handle_mouse_down() end
    return
  end
  if ev ~= "up" and ev ~= "press" then return end
  local pending = ui.double_click_pending
  ui.double_click_pending = nil
  if pending == "control" then handle_mouse_up(); return end
  local region, mouse = redraw_for_input()
  if region then
    -- mpv can emit DBL/press between LEFT/down and LEFT/up. The captured
    -- release owns that click; dispatching here would toggle twice.
    if ev == "press" and not ui.mouse_down_layout then
      activate_region(region, mouse)
      draw(true, "double-control")
    end
    return
  end
  if ui.mouse_down_region or ui.settings_open or ui.dragging or (ev == "up" and pending ~= "video") then return end
  note_direct_interaction()
  show_overlay()
  ui.mouse_down_region = nil
  ui.mouse_down_layout = nil
  safe_commandv("cycle", "fullscreen")
  draw(true, "double-click-binding")
end
bind("MBTN_LEFT_DBL", "streamnyaa-double-click", handle_double_click)
bind("mouse_move", "streamnyaa-mouse-move", handle_mouse_move)
bind("WHEEL_UP", "streamnyaa-wheel-up", function() handle_wheel(-1) end)
bind("WHEEL_DOWN", "streamnyaa-wheel-down", function() handle_wheel(1) end)

bind_key("ESC", "streamnyaa-escape", close_menu_or_overlay)
function keyboard_action(reason, fn)
  note_direct_interaction()
  show_overlay()
  safe_set_property("user-data/streamnyaa/last_shortcut", tostring(reason or "unknown"))
  fn()
  draw(true, reason)
end

function keyboard_toggle_pause(reason)
  if ui.end_overlay then activate_region({ id = ui.end_focus }, nil); draw(true, reason); return end
  keyboard_action(reason, function() safe_commandv("cycle", "pause") end)
end

function keyboard_seek(seconds, reason)
  if ui.end_overlay then
    local choices = ui.end_status == "unavailable" and {"end_replay", "end_close"} or ui.end_next_pending and {"end_replay", "end_close"} or {"end_next_episode", "end_replay", "end_close"}
    local current = 1
    for i, id in ipairs(choices) do if id == ui.end_focus then current = i end end
    ui.end_focus = choices[((current - 1 + (seconds > 0 and 1 or -1)) % #choices) + 1]
    draw(true, reason)
    return
  end
  keyboard_action(reason, function() seek_relative(seconds) end)
end

function keyboard_seek_percent(percent, reason)
  keyboard_action(reason, function()
    if (tonumber(state.duration) or 0) > 0 then
      note_explicit_seek(state.duration * clamp(percent / 100, 0, 1))
      safe_commandv("seek", tostring(percent), "absolute-percent+exact")
    end
  end)
end

function keyboard_change_speed(multiplier, reason)
  keyboard_action(reason, function()
    safe_commandv("multiply", "speed", tostring(multiplier))
    mp.add_timeout(0.05, function() emit_player_setting_changed("playbackSpeed", tostring(mp.get_property_number("speed") or state.speed or 1)) end)
  end)
end

function keyboard_toggle_mute(reason)
  keyboard_action(reason, function()
    safe_commandv("cycle", "mute")
    mp.add_timeout(0.05, function() emit_player_setting_changed("muted", mp.get_property_bool("mute") and "true" or "false") end)
  end)
end

bind_key("TAB", "streamnyaa-end-focus", function()
  if ui.end_overlay then keyboard_seek(1, "end-focus") end
end)
bind_key("ENTER", "streamnyaa-end-activate", function()
  if ui.end_overlay then activate_region({ id = ui.end_focus }, nil); draw(true, "end-activate") end
end)
bind_key("SPACE", "streamnyaa-space", function() keyboard_toggle_pause("key-space") end)
bind_key("k", "streamnyaa-k", function() keyboard_toggle_pause("key-k") end)
bind_key("K", "streamnyaa-k-shift", function() keyboard_toggle_pause("key-k-shift") end)
bind_key("LEFT", "streamnyaa-left", function() keyboard_seek(-5, "key-left") end)
bind_key("RIGHT", "streamnyaa-right", function() keyboard_seek(5, "key-right") end)
bind_key("j", "streamnyaa-j", function() keyboard_seek(-seek_step_seconds(), "key-j") end)
bind_key("J", "streamnyaa-j-shift", function() keyboard_seek(-seek_step_seconds(), "key-j-shift") end)
bind_key("l", "streamnyaa-l", function() keyboard_seek(seek_step_seconds(), "key-l") end)
bind_key("L", "streamnyaa-l-shift", function() keyboard_seek(seek_step_seconds(), "key-l-shift") end)
bind_key("UP", "streamnyaa-up", function()
  note_direct_interaction()
  show_overlay()
  safe_commandv("add", "volume", "5")
  mp.add_timeout(0.05, function() emit_player_setting_changed("volume", tostring(mp.get_property_number("volume") or state.volume or 100)) end)
  draw(true, "key-up")
end)
bind_key("DOWN", "streamnyaa-down", function()
  note_direct_interaction()
  show_overlay()
  safe_commandv("add", "volume", "-5")
  mp.add_timeout(0.05, function() emit_player_setting_changed("volume", tostring(mp.get_property_number("volume") or state.volume or 100)) end)
  draw(true, "key-down")
end)
bind_key("m", "streamnyaa-mute", function()
  keyboard_toggle_mute("key-mute")
end)
bind_key("M", "streamnyaa-mute-shift", function() keyboard_toggle_mute("key-mute-shift") end)
bind_key("c", "streamnyaa-cc", function() keyboard_action("key-cc", toggle_subtitles) end)
bind_key("C", "streamnyaa-cc-shift", function() keyboard_action("key-cc-shift", toggle_subtitles) end)
bind_key("a", "streamnyaa-audio", function() keyboard_action("key-audio", function() safe_commandv("cycle", "audio") end) end)
bind_key("s", "streamnyaa-settings", function() keyboard_action("key-settings", function() ui.dragging = nil; clear_drag_preview(); ui.settings_open = not ui.settings_open; ui.submenu = "main"; update_stall_watchdog_timer() end) end)
bind_key("S", "streamnyaa-settings-shift", function() keyboard_action("key-settings-shift", function() ui.dragging = nil; clear_drag_preview(); ui.settings_open = not ui.settings_open; ui.submenu = "main"; update_stall_watchdog_timer() end) end)
bind_key("i", "streamnyaa-skip-intro", function() keyboard_action("key-skip-intro", skip_intro) end)
bind_key("o", "streamnyaa-skip-outro", function() keyboard_action("key-skip-outro", skip_outro) end)
bind_key("p", "streamnyaa-pip", function() keyboard_action("key-mini", toggle_mini_player) end)
bind_key("f", "streamnyaa-fullscreen", function() keyboard_action("key-fullscreen", function() safe_commandv("cycle", "fullscreen") end) end)
bind_key("F", "streamnyaa-fullscreen-shift", function() keyboard_action("key-fullscreen-shift", function() safe_commandv("cycle", "fullscreen") end) end)
bind_key("[", "streamnyaa-speed-down", function() keyboard_change_speed(0.9091, "key-speed-down") end)
bind_key("]", "streamnyaa-speed-up", function() keyboard_change_speed(1.1, "key-speed-up") end)
bind_key("z", "streamnyaa-subtitle-earlier", function()
  keyboard_action("key-subtitle-earlier", function() set_release_subtitle_delay((tonumber(state.sub_delay) or 0) - 0.1) end)
end)
bind_key("x", "streamnyaa-subtitle-later", function()
  keyboard_action("key-subtitle-later", function() set_release_subtitle_delay((tonumber(state.sub_delay) or 0) + 0.1) end)
end)
bind_key("N", "streamnyaa-next-episode", function() keyboard_action("key-next-episode", function() request_next_episode("manual") end) end)
bind_key("HOME", "streamnyaa-home", function() keyboard_seek_percent(0, "key-home") end)
bind_key("END", "streamnyaa-end", function() keyboard_seek_percent(100, "key-end") end)

function bind_percent_key(digit)
  local percent = digit * 10
  bind_key(tostring(digit), "streamnyaa-percent-" .. tostring(digit), function()
    keyboard_seek_percent(percent, "key-percent-" .. tostring(digit))
  end)
end

for digit = 0, 9 do bind_percent_key(digit) end

function log_script_message(name, ...)
  if not DEBUG_SCRIPT_MESSAGES then return end
  local args_text = "[]"
  local ok, encoded = pcall(utils.format_json, { ... })
  if ok and encoded then args_text = encoded end
  msg.info(
    "[StreamNyaa Lua] script-message received: "
      .. tostring(name)
      .. " args="
      .. tostring(args_text)
      .. " initialized="
      .. tostring(ui.initialized)
      .. " loading="
      .. tostring(is_loading() or is_buffering())
      .. " rendered="
      .. tostring(ui.render_has_run)
      .. " time="
      .. tostring(mp.get_time())
  )
end

mp.register_script_message("streamnyaa-download-status", function(status)
  state.download_status = status ~= "" and status or nil
  mark_menus_dirty("main")
  draw(true)
end)

mp.register_script_message("streamnyaa-import-subtitle-path", function(path)
  log_script_message("streamnyaa-import-subtitle-path", path)
  local subtitle_path = tostring(path or "")
  if subtitle_path == "" then
    msg.info("External subtitle import cancelled or returned no path")
    settings_notice("No subtitle file selected")
    return
  end
  msg.info("Loading external subtitle: " .. subtitle_path)
  if safe_commandv("sub-add", subtitle_path, "select") then
    safe_set_property_bool("sub-visibility", true)
    mark_menus_dirty("main", "subs")
    settings_notice("Subtitle loaded")
    ui.settings_open = true
    ui.submenu = "subs"
    show_overlay()
    draw(true, "subtitle-import")
  else
    settings_notice("Subtitle could not be loaded")
    show_overlay()
    draw(true, "subtitle-import-failed")
  end
end)

mp.register_script_message("streamnyaa-set-auto-next", function(enabled)
  log_script_message("streamnyaa-set-auto-next", enabled)
  apply_player_preference("autoNextEpisode", enabled)
end)

mp.register_script_message("streamnyaa-set-player-preference", function(key, value)
  log_script_message("streamnyaa-set-player-preference", key, value)
  apply_player_preference(key, value)
end)

mp.register_event("file-loaded", function()
  show_overlay()
  ui.settings_open = false
  ui.submenu = "main"
  hide_end_overlay()
  ui.eof_handled_key = ""
  reset_stall_watchdog(false)
  reset_skip_range_state()
  ui.marker_log_key = ""
  ui.chapter_state_key = ""
  ui.eof_candidate_key = ""
  if not state.remember_speed then
    safe_set_property_number("speed", 1)
  end
  draw(true, "file-loaded")
end)
mp.register_event("end-file", function(event)
  show_overlay()
  ui.settings_open = false
  ui.submenu = "main"
  reset_skip_range_state()
  reset_buffering_state()
  reset_stall_watchdog(false)
  ui.marker_log_key = ""
  ui.chapter_state_key = ""
  if event and event.reason == "eof" then
    handle_episode_eof()
  else
    ui.eof_candidate_key = ""
    hide_end_overlay()
  end
  if event and event.reason == "error" and ui.last_video_path ~= "" then
    msg.warn("[StreamNyaa Lua] Video decoder ended with an error; requesting bounded recovery")
    request_backup_source_recovery()
  end
  draw(true, "end-file")
end)
mp.register_event("playback-restart", function()
  if has_playable_media() and not is_placeholder_media() then
    local offset_key = tostring(player_meta.subtitleOffsetKey or "")
    if ui.restored_offset_key ~= offset_key then
      safe_set_property_number("sub-delay", tonumber(player_meta.subtitleOffsetSeconds) or 0)
      ui.restored_offset_key = offset_key
    end
    local first_frame = not state.has_started_playback
    state.has_started_playback = true
    if first_frame then begin_first_video_frame_handoff() end
    if ui.recovery_attempt then ui.recovery_attempt.restart_seen = true end
    safe_set_property("user-data/streamnyaa/has_started", "true")
    reset_startup_stream_watchdog(true)
    ui.loading_override_until = 0
  end
  show_overlay()
  hide_end_overlay()
  ui.eof_handled_key = ""
  ui.last_next_episode_request_key = ""
  -- Cache observers own telemetry. Clearing it here can lose an unchanged
  -- paused-for-cache/cache-duration value immediately after a reload.
  if not ui.recovery_attempt and mp.get_time() >= (ui.stall_ignore_restart_until or 0) then
    reset_stall_watchdog(true)
  end
  restore_same_source_preferences()
  reset_skip_range_state()
  draw(true, "playback-restart")
end)

mp.add_periodic_timer(1, check_sleep_timer)
mp.add_periodic_timer(0.05, function()
  local loading = is_loading() or is_buffering() or hold_cover_for_first_video_frame()
  if loading then
    draw(true, "timer-loading")
  elseif ui.dragging then
    draw(true, "timer-drag")
  elseif ui.pending_draw then
    draw(false, "timer-pending")
  elseif ui.visible and not ui.settings_open and not state.paused and not ui.end_overlay and mp.get_time() - ui.last_interaction > AUTO_HIDE_SECONDS then
    draw(true, "timer-autohide")
  end
end)

stall_watchdog_timer = mp.add_periodic_timer(STALL_SAMPLE_SECONDS, check_playback_stall)
stall_watchdog_timer:stop()
startup_stream_watchdog_timer = mp.add_periodic_timer(STALL_SAMPLE_SECONDS, check_startup_stream_stall)

local stall_test_started = false
if script_options.stall_test_mode then
  mp.register_event("file-loaded", function()
    if stall_test_started then return end
    stall_test_started = true
    mp.add_timeout(0.5, function()
      state.has_started_playback = true
      state.idle = false
      state.core_idle = false
      state.paused = true
      state.paused_for_cache = true
      state.duration = math.max(60, tonumber(state.duration) or 0)
      log_buffering_transition()
      ui.stall_last_pos = tonumber(state.pos) or 0
      ui.stall_last_buffer = buffered_seconds()
      ui.stall_last_progress_at = mp.get_time() - STALL_RECOVERY_SECONDS - 1
      ui.stall_started_at = 0
      check_playback_stall()
      mp.add_timeout(0.8, function()
        state.has_started_playback = true
        state.idle = false
        state.core_idle = false
        state.paused = true
        state.paused_for_cache = true
        ui.stall_last_pos = tonumber(state.pos) or 0
        ui.stall_last_buffer = buffered_seconds()
        ui.stall_last_progress_at = mp.get_time() - STALL_RECOVERY_SECONDS - 1
        ui.stall_started_at = mp.get_time() - STALL_RECOVERY_SECONDS - STALL_ACTION_SECONDS - 1
        ui.stall_recovery_attempted = true
        ui.stall_recovery_at = mp.get_time() - STALL_ACTION_SECONDS - 1
        if ui.recovery_attempt then ui.recovery_attempt.started_at = ui.stall_recovery_at end
        check_playback_stall()
        ui.recovery_attempt = nil
        ui.recovery_terminal = false
        state.path = "startup-stall-test://stream"
        state.has_started_playback = false
        state.duration = 0
        state.idle = false
        state.core_idle = false
        state.paused = false
        state.paused_for_cache = true
        state.seeking = false
        ui.startup_stream_key = state.path
        ui.startup_stream_started_at = mp.get_time() - STARTUP_STREAM_RETRY_SECONDS - 1
        ui.startup_stream_retried = false
        ui.startup_stream_retry_at = 0
        ui.startup_stream_backup_requested = false
        ui.startup_stream_backup_at = 0
        msg.info(string.format(
          "[StreamNyaa Lua] Startup stall test invoking initial recovery path=%s placeholder=%s playable=%s duration=%s paused=%s",
          tostring(state.path), tostring(is_placeholder_media()), tostring(has_playable_media()), tostring(state.duration), tostring(state.paused)
        ))
        local startup_ok, startup_error = pcall(check_startup_stream_stall)
        if not startup_ok then msg.error("[StreamNyaa Lua] Startup stall test failed: " .. tostring(startup_error)) end
        mp.add_timeout(0.4, function()
          state.path = "startup-stall-test://stream"
          state.has_started_playback = false
          state.duration = 0
          state.idle = false
          state.core_idle = false
          state.paused = false
          state.paused_for_cache = true
          state.seeking = false
          ui.startup_stream_key = state.path
          ui.startup_stream_started_at = math.max(0.01, mp.get_time() - STARTUP_STREAM_RETRY_SECONDS - 0.05)
          ui.startup_stream_retried = true
          ui.startup_stream_retry_at = mp.get_time() - STARTUP_STREAM_BACKUP_SECONDS - 1
          if ui.recovery_attempt then ui.recovery_attempt.started_at = ui.startup_stream_retry_at end
          ui.startup_stream_backup_requested = false
          ui.startup_stream_backup_at = 0
          msg.info("[StreamNyaa Lua] Startup stall test invoking backup recovery")
          local backup_ok, backup_error = pcall(check_startup_stream_stall)
          if not backup_ok then msg.error("[StreamNyaa Lua] Startup backup test failed: " .. tostring(backup_error)) end
        end)
      end)
    end)
  end)
end

mp.register_script_message("streamnyaa-reload-meta", function(meta_file)
  log_script_message("streamnyaa-reload-meta", meta_file)
  if meta_file and tostring(meta_file) ~= "" then
    script_options.meta_file = tostring(meta_file)
  end
  debug_cover("reload metadata message received: " .. tostring(script_options.meta_file or ""))
  load_player_meta()
  msg.info("[StreamNyaa Lua] render requested after metadata reload")
  ui.anim_started = mp.get_time()
  -- Metadata does not own decoder lifecycle. Only a new media path may reset
  -- a playing stream; refreshing episode/cover data during buffering may not.
  if not has_playable_media() then
    ui.loading_override_until = mp.get_time() + 2.5
    state.has_started_playback = false
  end
  show_overlay()
  draw(true, "reload-meta")
end)

mp.register_script_message("streamnyaa-playback-ready", function()
  log_script_message("streamnyaa-playback-ready")
  -- This message confirms that the native MPV window and IPC bridge are ready;
  -- it does not mean the torrent has produced a decoded video frame. Keep the
  -- artwork visible until playback-restart or advancing time-pos proves that.
  msg.info("[StreamNyaa Lua] player shell ready; waiting for the first video frame")
  if is_placeholder_media() then
    ui.recovery_terminal = false
    ui.recovery_attempt = nil
    reset_stall_watchdog(false)
  end
  show_overlay()
  draw(true, "player-shell-ready")
end)

mp.register_script_message("streamnyaa-source-generation", function(value)
  local generation = tonumber(value)
  if not generation or generation < 1 or generation % 1 ~= 0 then return end
  if generation <= (ui.source_generation or 0) then return end
  ui.source_generation = generation
  ui.recovery_terminal = false
  ui.recovery_attempt = nil
end)

mp.register_script_message("streamnyaa-playback-failed", function(value)
  -- Old native tasks must not cover a newer video with their error screen.
  if ui.source_generation and tonumber(value) ~= ui.source_generation then return end
  ui.recovery_terminal = true
  ui.stall_actions_visible = true
  ui.startup_stream_actions_visible = true
  safe_set_property("user-data/streamnyaa/recovery_stage", "failed")
  show_overlay()
  draw(true, "stream-start-failed")
end)

function apply_custom_shortcuts(config)
  if type(config) ~= "table" then return end
  local actions = {
    pause = function() keyboard_toggle_pause("custom-pause") end,
    fullscreen = function() keyboard_action("custom-fullscreen", function() safe_commandv("cycle", "fullscreen") end) end,
    mute = function() keyboard_toggle_mute("custom-mute") end,
    back = function() keyboard_seek(-seek_step_seconds(), "custom-back") end,
    forward = function() keyboard_seek(seek_step_seconds(), "custom-forward") end,
    settings = function() keyboard_action("custom-settings", function() ui.dragging = nil; clear_drag_preview(); ui.settings_open = not ui.settings_open; ui.submenu = "main"; update_stall_watchdog_timer() end) end,
  }
  local used = {}
  for action in pairs(actions) do
    local key = config[action]
    if type(key) ~= "string" or #key > 12 or used[key] then return end
    if not (key == "SPACE" or key:match("^[a-z]$") or key:match("^F%d%d?$") or key:match("^Ctrl%+[a-z]$") or key:match("^Alt%+[a-z]$")) then return end
    used[key] = true
  end
  for _, name in ipairs({"streamnyaa-space", "streamnyaa-fullscreen", "streamnyaa-mute", "streamnyaa-j", "streamnyaa-l", "streamnyaa-settings"}) do mp.remove_key_binding(name) end
  for action, callback in pairs(actions) do bind_key(config[action], "streamnyaa-custom-" .. action, callback) end
end

load_persisted_player_preferences()
load_player_meta()
local shortcut_content = read_binary_file(tostring(script_options.meta_file or ""))
local shortcut_metadata = shortcut_content and utils.parse_json(shortcut_content) or nil
if type(shortcut_metadata) == "table" then apply_custom_shortcuts(shortcut_metadata.shortcuts) end
msg.info("[StreamNyaa Lua] render requested after startup metadata load")
refresh_track_cache(state.tracks)
ui.initialized = true
safe_commandv("script-message", "streamnyaa-lua-ready")
mp.add_timeout(0.35, function()
  safe_commandv("script-message", "streamnyaa-lua-ready")
end)
draw(true, "init")

-- Actual playback coverage: seeking never fills the skipped interval.
local coverage = {version=2, intervals={}, furthest=0, lastPosition=0}
local coverage_sample = nil
mp.register_event("file-loaded", function() coverage={version=2,intervals={},furthest=0,lastPosition=0}; coverage_sample=nil end)
mp.register_event("seek", function() coverage_sample=nil end)
mp.add_periodic_timer(0.5, function()
 local pos=mp.get_property_number("time-pos")
 local now=mp.get_time()
 local speed=mp.get_property_number("speed",1)
 local playing=not mp.get_property_native("pause",true) and not mp.get_property_native("paused-for-cache",false) and not mp.get_property_native("seeking",false)
 if not pos or pos<0 then coverage_sample=nil; return end
 coverage.lastPosition=pos
 if playing and coverage_sample then
  local delta=pos-coverage_sample.pos
  local elapsed=now-coverage_sample.time
  if elapsed>0 and elapsed<2 and delta>0 and delta<=elapsed*math.max(speed,coverage_sample.speed)+0.35 then
   local ranges=coverage.intervals
   ranges[#ranges+1]={coverage_sample.pos,pos}
   table.sort(ranges,function(a,b)return a[1]<b[1] end)
   local merged={}
   for _,range in ipairs(ranges) do
    local last=merged[#merged]
    if last and range[1]<=last[2]+0.05 then last[2]=math.max(last[2],range[2]) else merged[#merged+1]=range end
   end
   coverage.intervals=merged; coverage.furthest=math.max(coverage.furthest,pos)
  end
 end
 coverage_sample=playing and {pos=pos,time=now,speed=speed} or nil
 mp.set_property("user-data/streamnyaa/watched-coverage",require('mp.utils').format_json(coverage))
end)

-- A missing application response must not leave Next permanently disabled.
function check_next_request_timeout()
  if ui.end_next_pending and ui.end_request_deadline and mp.get_time() >= ui.end_request_deadline then
    emit_next_request("cancel", ui.end_request_id)
    ui.end_request_id = ""
    ui.end_request_deadline = nil
    ui.end_next_pending = false
    ui.end_status = "failed"
    settings_notice("Next episode did not respond. Select Next to retry.")
    draw(true, "next-request-timeout")
  end
end
mp.add_periodic_timer(1, check_next_request_timeout)
