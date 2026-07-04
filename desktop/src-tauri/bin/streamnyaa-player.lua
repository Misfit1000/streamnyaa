local mp = require "mp"
local assdraw = require "mp.assdraw"
local msg = require "mp.msg"
local utils = require "mp.utils"
local options = require "mp.options"

-- StreamNyaa Desktop MPV OSC.
-- MPV launches with --osc=no, so this file is the only player overlay.

local C = {
  accent = "2D1FFF",      -- #ff1f2d
  hover = "4533FF",       -- #ff3345
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
}

options.read_options(script_options)
options.read_options(script_options, "streamnyaa_player")
msg.info(
  "[StreamNyaa Lua] script options resolved: meta_file="
    .. tostring(script_options.meta_file or "")
    .. " subtitle_request_file="
    .. tostring(script_options.subtitle_request_file or "")
)

local DEBUG_INPUT = false
local DEBUG_PERF = false
local DEBUG_SUBMENU_PERF = false
local DEBUG_SCRIPT_MESSAGES = false
local DEBUG_FORCE_MINIMAL_OSD = false
local ENABLE_COVER_BITMAP_OVERLAY = false
local DEBUG_COVER_LOADING = false
local DEBUG_LOADING_DRAW = false
local DEBUG_COVER_TEST = false

msg.info("[StreamNyaa Lua] streamnyaa-player.lua loaded")

local state = {
  duration = 0,
  pos = 0,
  paused = false,
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
  theater_mode = false,
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
  eof_handled_key = "",
  last_buffering_active = false,
  last_buffering_percent = nil,
  skip_range_state = {},
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
}

local cover_overlay = nil
local cover_overlay_key = ""
local cover_overlay_supported = true
local debug_cover_test_data = nil

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
local THEATER_GEOMETRY = "1280x720"
local NORMAL_GEOMETRY = "1120x630"
local SUBTITLE_STYLE_DEFAULT = {
  font_size = "medium",
  position = "normal",
  text_color = "white",
  outline = "medium",
  shadow = "off",
  background = "light",
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
  local ok, err = pcall(function() mp.commandv(unpack_args(args)) end)
  if not ok then
    msg.warn("StreamNyaa player command failed: " .. tostring(err))
  end
  return ok
end

function safe_set_property(name, value)
  return safe_commandv("set", name, tostring(value))
end

function safe_set_property_bool(name, value)
  local ok, err = pcall(function() mp.set_property_bool(name, value == true) end)
  if not ok then
    msg.warn("StreamNyaa player bool property failed: " .. tostring(err))
    return safe_set_property(name, value and "yes" or "no")
  end
  return true
end

function safe_set_property_number(name, value)
  local number_value = tonumber(value) or 0
  local ok, err = pcall(function() mp.set_property_number(name, number_value) end)
  if not ok then
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

function draw_text(ass, x, y, align, size, color, alpha, value, bold, font)
  ass:new_event()
  ass:append(string.format(
    "{\\an%d\\pos(%.2f,%.2f)\\fn%s\\fs%d\\bord0\\shad0\\b%d\\c&H%s&\\alpha&H%02X&}%s",
    align,
    x,
    y,
    font or "Segoe UI",
    math.max(1, math.floor(size)),
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
  return title:upper()
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
  local key = table.concat({
    title,
    tostring(math.floor(width or 0)),
    tostring(math.floor(height or 0)),
  }, ":")
  if ui.title_layout_key == key and ui.title_layout then
    return ui.title_layout
  end

  local max_width = width * 0.82
  local size = clamp(86 * s, 46 * s, 108 * s)
  local spacing = clamp(size * 0.055, 1.6 * s, 5.8 * s)

  while size > 42 * s and estimated_spaced_text_width(title, size, spacing) > max_width do
    size = size - 2 * s
    spacing = clamp(size * 0.052, 1.4 * s, 5.2 * s)
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
      while size > 36 * s do
        spacing = clamp(size * 0.047, 1.2 * s, 4.8 * s)
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
    pcall(function() cover_overlay:remove() end)
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
  local previous_cover_key = cover_metadata_key()

  player_meta.animeTitle = tostring(data.animeTitle or data.anime_title or "")
  player_meta.episodeTitle = tostring(data.episodeTitle or data.episode_title or "")
  player_meta.episodeNumber = tostring(data.episodeNumber or data.episode_number or "")
  player_meta.loadingImagePath = tostring(data.loadingImagePath or data.loading_image_path or "")
  player_meta.loadingImageWidth = tonumber(data.loadingImageWidth or data.loading_image_width) or 0
  player_meta.loadingImageHeight = tonumber(data.loadingImageHeight or data.loading_image_height) or 0
  player_meta.coverPosterBgraPath = tostring(data.coverPosterBgraPath or data.cover_poster_bgra_path or "")
  player_meta.coverPosterWidth = tonumber(data.coverPosterWidth or data.cover_poster_width) or 0
  player_meta.coverPosterHeight = tonumber(data.coverPosterHeight or data.cover_poster_height) or 0
  player_meta.coverBackgroundBgraPath = tostring(data.coverBackgroundBgraPath or data.cover_background_bgra_path or "")
  player_meta.coverBackgroundWidth = tonumber(data.coverBackgroundWidth or data.cover_background_width) or 0
  player_meta.coverBackgroundHeight = tonumber(data.coverBackgroundHeight or data.cover_background_height) or 0
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

  if previous_title ~= tostring(player_meta.animeTitle or "") then
    ui.title_layout_key = ""
    ui.title_layout = nil
  end

  local next_cover_key = cover_metadata_key()
  if previous_cover_key ~= next_cover_key then
    clear_cover_overlay()
    ui.cover_missing_log_key = ""
    if next_cover_key ~= "" and ui.cover_loaded_log_key ~= next_cover_key then
      msg.info("StreamNyaa loading cover metadata ready.")
      ui.cover_loaded_log_key = next_cover_key
    end
  end
end

function ensure_cover_overlay()
  if not cover_overlay_supported then return false end
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
  local data = nil
  if cover_path == "__streamnyaa_debug_cover_test__" then
    data = generated_debug_cover_data(cover_w, cover_h)
  else
    data = read_binary_file(cover_path)
  end
  if not data or #data == 0 then
    if ui.cover_missing_log_key ~= key then
      msg.warn("StreamNyaa loading cover file is not ready yet.")
      ui.cover_missing_log_key = key
    end
    debug_cover("cover file missing: " .. cover_path)
    return false
  end
  local expected_bytes = cover_w * cover_h * 4
  if #data ~= expected_bytes then
    msg.warn(
      string.format(
        "StreamNyaa loading cover has invalid BGRA size: got %d bytes, expected %d.",
        #data,
        expected_bytes
      )
    )
    debug_cover("invalid cover bytes: " .. cover_path)
    return false
  end

  local ok, overlay = pcall(mp.create_osd_overlay, "bgra")
  if not ok or not overlay then
    cover_overlay_supported = false
    msg.warn("StreamNyaa cover overlay is not supported by this MPV build.")
    return false
  end

  overlay.data = data
  overlay.w = cover_w
  overlay.h = cover_h
  overlay.stride = cover_w * 4
  overlay.z = -100
  cover_overlay = overlay
  cover_overlay_key = key
  if ui.cover_loaded_log_key ~= key then
    msg.info("StreamNyaa loading cover overlay loaded.")
    ui.cover_loaded_log_key = key
  end
  debug_cover("cover overlay loaded kind=" .. cover_kind .. " bytes=" .. tostring(#data))
  return true
end

function update_cover_overlay(show, width, height, s)
  if not show then
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
  local x = math.floor(width / 2 - cover_w / 2)
  local y = math.floor(height / 2 - cover_h / 2)
  cover_overlay.x = x
  cover_overlay.y = y
  local ok, err = pcall(function() cover_overlay:update() end)
  if not ok then
    msg.warn("StreamNyaa cover overlay update failed: " .. tostring(err))
    cover_overlay_supported = false
    clear_cover_overlay()
    return nil
  end
  return { x = x, y = y, w = cover_w, h = cover_h, kind = cover_kind }
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
  safe_commandv("script-message", "streamnyaa-player-setting-changed", tostring(key or ""), tostring(value or ""))
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
  if key == "autoNextEpisode" or key == "auto_next_episode" then
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

function is_placeholder_media()
  return tostring(state.path or ""):find("streamnyaa%-loading%.bmp") ~= nil
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
  if is_placeholder_media() or state.idle or state.core_idle then return false end
  if ui.dragging == "seek" then return false end
  if state.paused and not state.paused_for_cache then return false end
  if state.paused_for_cache then return true end
  if state.cache_buffering_active then return true end
  return state.demuxer_underrun == true
end

function is_buffering()
  return is_midplayback_buffering()
end

function is_loading()
  if is_midplayback_buffering() then return false end
  if state.paused_for_cache and not has_playable_media() then return true end
  if is_placeholder_media() then return true end
  if ui.loading_override_until and mp.get_time() < ui.loading_override_until then return true end
  if has_playable_media() then return false end
  if state.idle or state.core_idle then return true end
  return not state.has_started_playback and (tonumber(state.duration) or 0) <= 0
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
  if not value or value <= 0 or value >= 100 then return nil end
  return math.floor(clamp(value, 0, 100) + 0.5)
end

function buffering_display_percent()
  local cache_percent = state.cache_buffering_active and clean_buffering_percent(state.cache_buffering_percent) or nil
  if cache_percent then return cache_percent end
  if state.demuxer_underrun then return clean_buffering_percent(state.demuxer_buffering_percent) end
  return nil
end

function buffered_seconds()
  local seconds = tonumber(state.demuxer_cache_duration)
  if seconds and seconds > 0 then return seconds end
  local cache_end = tonumber(state.cache_end) or 0
  local pos = tonumber(state.pos) or 0
  if cache_end > pos then return cache_end - pos end
  return nil
end

function buffering_status_label()
  local percent = buffering_display_percent()
  local cached = buffered_seconds()
  local label = percent and string.format("BUFFERING %d%%", percent) or "BUFFERING..."
  if percent and cached and cached >= 1 then
    label = string.format("%s - %ds cached", label, math.floor(cached + 0.5))
  end
  return label
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
  state.demuxer_underrun = false
  state.cache_end = 0
  ui.last_buffering_active = false
  ui.last_buffering_percent = nil
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
  local range = explicit_skip_range(kind, pos, allow_nearby)
  if range then return range end
  return fallback_skip_range(kind, pos, allow_nearby)
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
  local range = skip_range_for_position(kind, pos, true)
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

function current_media_key()
  local path = tostring(state.path or "")
  local title = tostring(state.title or state.filename or "")
  local duration = math.floor(tonumber(state.duration) or 0)
  return table.concat({ path, title, tostring(duration) }, "|")
end

function reset_end_overlay_state()
  ui.end_overlay = false
  ui.end_overlay_key = ""
  ui.eof_handled_key = ""
  ui.last_next_episode_request_key = ""
end

function hide_end_overlay()
  ui.end_overlay = false
  ui.end_overlay_key = ""
end

function scaled(width, height)
  return clamp(math.min(width / 1920, height / 1080), 0.72, 1.35)
end

function draw_gradient_top(ass, width, height, s)
  local h = 92 * s
  for i = 0, 9 do
    local y1 = i * h / 10
    local y2 = (i + 1) * h / 10
    rect(ass, 0, y1, width, y2, C.black, 218 + i * 3)
  end
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
  local next_reason = tostring(reason or "manual")
  if next_reason ~= "ended" and next_reason ~= "manual" then
    next_reason = "manual"
  end
  local key = current_media_key()
  local request_key = next_reason .. ":" .. key
  if next_reason == "ended" and request_key == ui.last_next_episode_request_key then
    msg.info("[StreamNyaa Lua] Duplicate EOF next request ignored key=" .. request_key)
    return
  end
  if next_reason == "ended" then
    ui.last_next_episode_request_key = request_key
  else
    ui.last_next_episode_request_key = ""
  end
  msg.info("[StreamNyaa Lua] Sending next episode request reason=" .. next_reason .. " key=" .. tostring(key))
  safe_commandv("script-message", "streamnyaa-next-episode-request", next_reason)
  if next_reason ~= "ended" or state.autoplay then
    settings_notice(next_reason == "ended" and "Opening next episode..." or "Next episode requested")
  end
end

function handle_episode_eof()
  if not state.has_started_playback or is_placeholder_media() or not has_playable_media() then return end
  local key = current_media_key()
  if key == "" or ui.eof_handled_key == key then return end
  ui.eof_handled_key = key
  show_overlay()
  msg.info("[StreamNyaa Lua] EOF normal; sending next request reason=ended key=" .. tostring(key))
  msg.info("[StreamNyaa Lua] EOF reached; showing fail-safe end overlay")
  ui.end_overlay = true
  ui.end_overlay_key = key
  request_next_episode("ended")
end

function draw_gradient_bottom(ass, width, height, s)
  local h = 164 * s
  local start = height - h
  for i = 0, 11 do
    local t1 = i / 12
    local t2 = (i + 1) / 12
    local y1 = start + h * t1
    local y2 = start + h * t2
    local alpha = 246 - i * 3
    rect(ass, 0, y1, width, y2, C.black, clamp(alpha, 210, 248))
  end
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
  local x1, y1 = icon_point(cx, cy, size, 7.3, 5.8)
  local x2, y2 = icon_point(cx, cy, size, 10.1, 18.2)
  rounded_rect(ass, x1, y1, x2, y2, size * 0.06, color, 0)
  x1, y1 = icon_point(cx, cy, size, 13.9, 5.8)
  x2, y2 = icon_point(cx, cy, size, 16.7, 18.2)
  rounded_rect(ass, x1, y1, x2, y2, size * 0.06, color, 0)
end

function icon_skip(ass, cx, cy, size, color, forward)
  local t = icon_stroke(size, 0.075)
  draw_text(ass, cx, cy + size * 0.12, 5, size * 0.30, color, 0, "10", true, "Segoe UI Semibold")
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
  local t = math.max(2.1, size * 0.078)
  icon_line(ass, cx, cy, size, 4.2, 7.2, 19.8, 7.2, color, t)
  icon_line(ass, cx, cy, size, 4.2, 12, 19.8, 12, color, t)
  icon_line(ass, cx, cy, size, 4.2, 16.8, 19.8, 16.8, color, t)
  local k1x, k1y = icon_point(cx, cy, size, 9.0, 7.2)
  local k2x, k2y = icon_point(cx, cy, size, 15.0, 12)
  local k3x, k3y = icon_point(cx, cy, size, 11.5, 16.8)
  circle(ass, k1x, k1y, size * 0.105, color, 0)
  circle(ass, k2x, k2y, size * 0.105, color, 0)
  circle(ass, k3x, k3y, size * 0.105, color, 0)
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
  if name == "speed" then
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
  if hot or active then
    circle(ass, cx, cy, hit * 0.44, active and C.accent or C.white, hot and 228 or 214)
  end
  draw_icon(ass, cx, cy, icon_size, active and C.accent or C.white)
  add_region(id, cx - hit / 2, cy - hit / 2, cx + hit / 2, cy + hit / 2)
end

function pill_button(ass, mouse, id, cx, cy, width, height, label, active, s)
  local x1, y1 = cx - width / 2, cy - height / 2
  local x2, y2 = cx + width / 2, cy + height / 2
  local hot = inside(mouse, x1, y1, x2, y2)
  if hot or active then
    rounded_rect(ass, x1, y1, x2, y2, height / 2, active and C.accent or C.white, hot and 230 or 214)
  end
  draw_text(ass, cx - 7 * s, cy + 7 * s, 5, font_px(s, 18, 16, 19), active and C.accent or C.white, 0, label, false, "Segoe UI Semibold")
  icon_chevron(ass, cx + width / 2 - 16 * s, cy, 18 * s, active and C.accent or C.secondary, "right")
  add_region(id, x1, y1, x2, y2)
end

function seek_bounds(width, height, s)
  local y = height - 96 * s
  return 44 * s, y, width - 44 * s, y
end

function volume_bounds(width, height, s)
  local y = height - 42 * s
  return 376 * s, y, math.min(526 * s, width * 0.42), y
end

function slider_hit_half_height(s)
  return math.max(22, math.min(32, 24 * s))
end

function draw_title_area(ass, width, height, s)
  local x = 48 * s
  draw_text(ass, x, 50 * s, 4, font_px(s, 25, 22, 27), C.white, 0, media_title(), true, "Segoe UI Semibold")
  local subline = is_buffering() and "Buffering local stream" or "Local playback"
  draw_text(ass, x, 79 * s, 4, font_px(s, 14, 13, 16), C.white, 80, subline, false, "Segoe UI")
end

function draw_center_play(ass, width, height, mouse, s)
  if not state.paused or is_loading() then return end
  local cx, cy = width / 2, height / 2
  local r = 43 * s
  local hot = inside(mouse, cx - r, cy - r, cx + r, cy + r)
  circle(ass, cx, cy, r + 10 * s, C.accent, hot and 226 or 242)
  circle(ass, cx, cy, r, C.black, hot and 64 or 88)
  circle(ass, cx, cy, r + 1.5 * s, hot and C.accent or C.white, hot and 82 or 202)
  icon_play(ass, cx + 2 * s, cy, 32 * s, C.white)
  local hit = math.max(r + 10 * s, 48)
  add_region("center_play", cx - hit, cy - hit, cx + hit, cy + hit)
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
    buffered = clamp(math.max(ratio, ratio + (1 - ratio) * ((state.cache_percent or 0) / 100)), 0, 1)
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
  draw_text(ass, x2, y + 34 * s, 6, font_px(s, 17, 16, 19), C.white, 0, string.format("%s / %s", format_time(display_pos), state.duration > 0 and format_time(state.duration) or "--:--"), false, "Segoe UI")
  add_region("seek", x1, y - seek_hit_y, x2, y + seek_hit_y)

  if seek_hot and state.duration > 0 then
    local preview_ratio = timeline_ratio(mouse, width, height, s)
    local px = x1 + w * preview_ratio
    rounded_rect(ass, px - 44 * s, y - 50 * s, px + 44 * s, y - 22 * s, 8 * s, C.panel, 18)
    draw_text(ass, px, y - 31 * s, 5, font_px(s, 14, 13, 16), C.white, 0, format_time(preview_ratio * state.duration), true, "Segoe UI Semibold")
  end
end

function draw_controls(ass, width, height, mouse, s)
  local y = height - 42 * s
  local left = 54 * s
  local right = width - 62 * s
  local hit = 48 * s
  local icon = 30 * s
  local skip_icon = 31 * s
  local play_icon = 35 * s

  button(ass, mouse, "play", left, y, 56 * s, play_icon, function(a, x, yy, size, color)
    if state.paused or is_loading() then icon_play(a, x + 2 * s, yy, size, color) else icon_pause(a, x, yy, size, color) end
  end)
  button(ass, mouse, "back", left + 82 * s, y, hit, skip_icon, function(a, x, yy, size, color) icon_skip(a, x, yy, size, color, false) end)
  button(ass, mouse, "forward", left + 158 * s, y, hit, skip_icon, function(a, x, yy, size, color) icon_skip(a, x, yy, size, color, true) end)
  button(ass, mouse, "next_episode", left + 226 * s, y, hit, icon, icon_next_episode)
  button(ass, mouse, "mute", left + 294 * s, y, hit, icon, icon_volume)

  local vx1, vy, vx2 = volume_bounds(width, height, s)
  if vx2 > vx1 + 68 * s then
    local volume_dragging = ui.dragging == "volume"
    local vr = volume_dragging and (current_drag_ratio() or 0) or clamp((state.volume or 0) / 130, 0, 1)
    local vh = volume_dragging and 6 * s or 4 * s
    rounded_rect(ass, vx1, vy - vh / 2, vx2, vy + vh / 2, vh / 2, C.track, 184)
    rounded_rect(ass, vx1, vy - vh / 2, vx1 + (vx2 - vx1) * vr, vy + vh / 2, vh / 2, C.accent, 0)
    circle(ass, vx1 + (vx2 - vx1) * vr, vy, volume_dragging and 9.5 * s or 6 * s, C.accent, 0)
    local volume_hit_y = slider_hit_half_height(s)
    add_region("volume", vx1 - 10 * s, vy - volume_hit_y, vx2 + 10 * s, vy + volume_hit_y)
  end

  button(ass, mouse, "subs", right - 426 * s, y, hit, icon, icon_cc, state.sub_visible and state.sid ~= "no")
  button(ass, mouse, "settings", right - 356 * s, y, hit, icon, icon_gear, ui.settings_open)
  pill_button(ass, mouse, "speed", right - 266 * s, y, 92 * s, 40 * s, speed_label(), ui.settings_open and ui.submenu == "speed", s)
  button(ass, mouse, "mini", right - 166 * s, y, hit, icon, icon_mini, state.mini_player)
  button(ass, mouse, "theater", right - 94 * s, y, hit, icon, icon_theater, state.theater_mode)
  button(ass, mouse, "fullscreen", right - 24 * s, y, hit, icon, icon_fullscreen, state.fullscreen)
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
  for _, kind in ipairs({ "intro", "outro" }) do
    if not ((kind == "intro" and state.skip_intro) or (kind == "outro" and state.skip_outro)) then
      local range = manual_strict_skip_range(kind, tonumber(state.pos) or 0)
      if range then
        local entry = skip_state_for(range.key)
        local now = mp.get_time()
        if entry and not entry.clicked and not entry.auto_skipped and not entry.dismissed then
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
          end
          if not entry.dismissed and now <= (entry.visible_until or 0) then
            show_overlay()
            woke = true
          end
        end
      end
    end
  end
  return woke
end

function draw_manual_skip_button(ass, mouse, range, index, width, height, s)
  if not range then return end
  local label = range.kind == "outro" and "SKIP OUTRO" or "SKIP INTRO"
  local button_w = 158 * s
  local button_h = 42 * s
  local x2 = width - 60 * s
  local y2 = height - (152 + (index or 0) * 50) * s
  local x1 = x2 - button_w
  local y1 = y2 - button_h
  local hot = inside(mouse, x1, y1, x2, y2)

  rounded_rect(ass, x1 - 6 * s, y1 - 6 * s, x2 + 6 * s, y2 + 6 * s, 20 * s, C.accent, hot and 222 or 240)
  rounded_rect(ass, x1, y1, x2, y2, 17 * s, C.panel, hot and 4 or 12)
  rounded_rect(ass, x1 + 2 * s, y1 + 2 * s, x2 - 2 * s, y2 - 2 * s, 15 * s, C.accent, hot and 10 or 22)
  rounded_outline(ass, x1, y1, x2, y2, 17 * s, 1.2 * s, C.accent, hot and 12 or 42)
  rounded_rect(ass, x1 + 10 * s, y1 + 8 * s, x1 + 42 * s, y2 - 8 * s, 12 * s, C.accent, hot and 0 or 8)
  icon_skip_compact(ass, x1 + 26 * s, (y1 + y2) / 2, 16 * s, C.white)
  draw_text(ass, x1 + 52 * s, y1 + 23 * s, 4, font_px(s, 14, 13, 15), C.white, 0, label, true, "Segoe UI Semibold")
  add_region("manual_skip_" .. tostring(range.kind), x1, y1, x2, y2, {
    key = range.key,
    kind = range.kind,
    start_time = range.start_time,
    end_time = range.end_time,
    source = range.source,
  })
end

function draw_manual_skip_buttons(ass, width, height, mouse, s)
  local intro = manual_skip_range("intro")
  local outro = manual_skip_range("outro")
  if outro then draw_manual_skip_button(ass, mouse, outro, intro and 1 or 0, width, height, s) end
  if intro then draw_manual_skip_button(ass, mouse, intro, 0, width, height, s) end
end

function draw_end_button(ass, mouse, id, x1, y1, x2, y2, label, primary, s)
  local hot = inside(mouse, x1, y1, x2, y2)
  rounded_rect(ass, x1 - 5 * s, y1 - 5 * s, x2 + 5 * s, y2 + 5 * s, 17 * s, primary and C.accent or C.white, hot and 226 or 242)
  rounded_rect(ass, x1, y1, x2, y2, 14 * s, primary and C.accent or C.panel_2, hot and 0 or (primary and 8 or 18))
  rounded_outline(ass, x1, y1, x2, y2, 14 * s, 1.2 * s, primary and C.hover or C.white, hot and 42 or 150)
  draw_text(ass, (x1 + x2) / 2, y1 + 29 * s, 5, font_px(s, 14, 13, 16), C.white, 0, label, true, "Segoe UI Semibold")
  add_region(id, x1, y1, x2, y2)
end

function draw_end_overlay(ass, width, height, mouse, s)
  if not ui.end_overlay then return end
  local panel_w = math.min(width - 80 * s, 530 * s)
  local panel_h = 230 * s
  local x1 = (width - panel_w) / 2
  local y1 = (height - panel_h) / 2
  local x2 = x1 + panel_w
  local y2 = y1 + panel_h

  rounded_rect(ass, x1 - 14 * s, y1 - 14 * s, x2 + 14 * s, y2 + 14 * s, 30 * s, C.accent, 238)
  rounded_rect(ass, x1, y1, x2, y2, 24 * s, C.panel, 12)
  rounded_outline(ass, x1, y1, x2, y2, 24 * s, 1.3 * s, C.white, 214)
  draw_spaced_text(ass, (x1 + x2) / 2, y1 + 48 * s, 5, font_px(s, 13, 12, 15), C.accent, 0, "EPISODE FINISHED", 3 * s, true, "Segoe UI Semibold")
  draw_text(ass, (x1 + x2) / 2, y1 + 91 * s, 5, font_px(s, 25, 22, 28), C.white, 0, "Continue watching?", true, "Segoe UI Semibold")
  draw_text(ass, (x1 + x2) / 2, y1 + 122 * s, 5, font_px(s, 15, 14, 17), C.secondary, 20, "Play the next aired episode or replay this one.", false, "Segoe UI")

  local gap = 14 * s
  local button_h = 44 * s
  local next_w = 158 * s
  local replay_w = 118 * s
  local close_w = 98 * s
  local total_w = next_w + replay_w + close_w + gap * 2
  local bx = (width - total_w) / 2
  local by = y2 - 66 * s
  draw_end_button(ass, mouse, "end_next_episode", bx, by, bx + next_w, by + button_h, "NEXT EPISODE", true, s)
  bx = bx + next_w + gap
  draw_end_button(ass, mouse, "end_replay", bx, by, bx + replay_w, by + button_h, "REPLAY", false, s)
  bx = bx + replay_w + gap
  draw_end_button(ass, mouse, "end_close", bx, by, bx + close_w, by + button_h, "CLOSE", false, s)
end

function loading_status_text()
  if is_midplayback_buffering() then
    return buffering_status_label()
  elseif is_placeholder_media() then
    return "OPENING PLAYER..."
  elseif state.idle or state.core_idle then
    return "STARTING TORRENT ENGINE..."
  end
  return "PREPARING STREAM..."
end

function draw_loading_required_content(ass, width, height, s, status)
  local cx = width / 2
  if is_midplayback_buffering() then
    local t = (mp.get_time() - ui.anim_started)
    local spinner_y = height * 0.48
    local spinner_r = 20 * s
    local start_angle = (t * 260) % 360
    local card_w = math.min(width * 0.36, 430 * s)
    local card_h = 108 * s
    local x1 = cx - card_w / 2
    local y1 = spinner_y - card_h / 2
    rounded_rect(ass, x1, y1, x1 + card_w, y1 + card_h, 22 * s, C.black, 120)
    rounded_rect(ass, x1, y1, x1 + card_w, y1 + card_h, 22 * s, C.white, 238)
    draw_arc(ass, cx - 98 * s, spinner_y, spinner_r, 0, 360, 2.0 * s, C.white, 232)
    draw_arc(ass, cx - 98 * s, spinner_y, spinner_r, start_angle, 284, 3.4 * s, C.accent, 0)
    draw_text(ass, cx - 54 * s, spinner_y - 2 * s, 4, font_px(s, 19, 16, 23), C.white, 0, status, false, "Segoe UI Semibold")
    local cached = buffered_seconds()
    local secondary = cached and cached >= 1 and "Keeping playback smooth" or "Waiting for local buffer"
    draw_text(ass, cx - 54 * s, spinner_y + 24 * s, 4, font_px(s, 13, 12, 15), C.secondary, 12, secondary, false, "Segoe UI")
    return
  end

  local layout = loading_title_layout(loading_media_title(), width, height, s)
  local title_size = clamp(layout.size * 0.74, 30 * s, 62 * s)
  local line_gap = title_size * 1.13
  local title_center_y = height * 0.43
  local first_line_y = title_center_y - ((#layout.lines - 1) * line_gap / 2)
  local last_line_y = first_line_y + (#layout.lines - 1) * line_gap
  local spinner_y = last_line_y + title_size * 0.78 + 24 * s
  local status_y = spinner_y + 48 * s
  local t = (mp.get_time() - ui.anim_started)
  local spinner_r = 18 * s

  for index, line_value in ipairs(layout.lines) do
    draw_text(
      ass,
      cx,
      first_line_y + (index - 1) * line_gap,
      5,
      title_size,
      C.white,
      0,
      line_value,
      true,
      "Segoe UI Semibold"
    )
  end

  local start_angle = (t * 240) % 360
  draw_arc(ass, cx, spinner_y, spinner_r, 0, 360, 2.0 * s, C.white, 232)
  draw_arc(ass, cx, spinner_y, spinner_r, start_angle, 284, 3.4 * s, C.accent, 0)
  draw_text(ass, cx, status_y, 5, font_px(s, 18, 16, 21), C.white, 4, status, true, "Segoe UI Semibold")
end

function draw_loading(ass, width, height, s, cover_info)
  if not (is_loading() or is_buffering()) then return end
  local cx = width / 2
  local status = loading_status_text()
  local buffering_only = is_midplayback_buffering()
  local before_len = #ass.text

  local ok, err = pcall(function()
    if buffering_only then
      rect(ass, 0, 0, width, height, C.black, 214)
    elseif not cover_info then
      rect(ass, 0, 0, width, height, C.black, 0)
      circle(ass, width * 0.36, height * 0.48, height * 0.56, C.accent, 242)
      circle(ass, width * 0.70, height * 0.30, height * 0.40, "7C2DFF", 248)
    else
      rect(ass, 0, 0, width, height, C.black, 126)
    end
    rect(ass, 0, 0, width, height, C.accent, 246)
    if not buffering_only then
      circle(ass, cx, height * 0.43 + 48 * s, height * 0.36, C.black, 210)
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
      cover_info and tostring(cover_info.kind or "cover") or "fallback",
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

function menu_cache_key(menu)
  if menu == "main" then
    return table.concat({
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
      tostring(state.theater_mode),
      tostring(state.fullscreen),
      subtitle_style_cache_key(),
      tostring(track_cache_generation),
    }, "|")
  elseif menu == "speed" then
    return tostring(state.speed)
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
    { id = "settings:subs", icon = "sub", label = "Subtitles / CC", value = current_track_label("sub", "Off"), type = "submenu", active = state.sub_visible and state.sid ~= "no" },
    { id = "settings:appearance", icon = "appearance", label = "Subtitle Appearance", value = subtitle_style_summary(), type = "submenu", active = state.subtitle_style.custom },
    { id = "settings:audio", icon = "audio", label = "Audio", value = current_track_label("audio", "Auto") .. " / " .. format_audio_delay(state.audio_delay), type = "submenu", active = math.abs(tonumber(state.audio_delay) or 0) >= 0.005 },
    { id = "settings:video", icon = "video", label = "Video", value = video_aspect_label() .. " / " .. video_zoom_label(), type = "submenu", active = state.video_aspect ~= "default" or math.abs(tonumber(state.video_zoom) or 0) >= 0.005 },
    { id = "settings:playback", icon = "speed", label = "Playback Speed", value = speed_label(), type = "submenu", active = state.loop_file or math.abs((tonumber(state.speed) or 1) - 1) >= 0.03 },
    { id = "settings:autoplay", icon = "autoplay", label = "Auto Next Episode", value = "", type = "toggle", active = state.autoplay },
    { id = "settings:skip", icon = "skip", label = "Auto Skip Marked Intro", value = "", type = "toggle", active = state.skip_intro },
    { id = "settings:skip_outro", icon = "skip", label = "Auto Skip Marked Outro", value = "", type = "toggle", active = state.skip_outro },
    { id = "settings:mini", icon = "mini", label = "Mini Player", value = "", type = "toggle", active = state.mini_player },
    { id = "settings:theater", icon = "theater", label = "Theater Mode", value = "", type = "toggle", active = state.theater_mode },
    { id = "settings:fullscreen", icon = "full", label = "Full Screen", value = state.fullscreen and "On" or "Off", type = "action", active = state.fullscreen },
  }
end

function build_submenu_rows(menu)
  if menu == "speed" then
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
  if menu == "speed" then
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
  local rows = cached_menu_rows("main", build_main_settings_rows)
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

  local output = {}
  local active_included = false
  for i = 1, max_options - 1 do
    output[#output + 1] = options[i]
    if options[i] and options[i].active then active_included = true end
  end

  if not active_included then
    for i = max_options, #options do
      if options[i] and options[i].active then
        output[#output + 1] = options[i]
        active_included = true
        break
      end
    end
  end

  if not active_included then
    output[#output + 1] = {
      label = string.format("%d more items", #options - (max_options - 1)),
      detail = "Use MPV shortcuts",
      value = "__more",
      disabled = true
    }
  end

  return output
end

function draw_option_submenu(ass, width, height, mouse, s, title, options, prefix)
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
  if ui.submenu == "subs" and #options > #menu_options then
    local visible_count = math.max(1, #menu_options)
    local max_scroll = math.max(1, #options - visible_count)
    local ratio = clamp((ui.subtitle_menu_scroll or 0) / max_scroll, 0, 1)
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

function draw(immediate, reason)
  local now = mp.get_time()
  local width, height = mp.get_osd_size()
  if not width or not height or width <= 0 or height <= 0 then
    width, height = 1280, 720
  end
  local force_minimal_osd = DEBUG_FORCE_MINIMAL_OSD
  local loading = is_loading() or is_buffering()
  if not force_minimal_osd and not immediate and not ui.visible and not loading and not ui.pending_draw and not ui.end_overlay then
    return
  end
  local active_interaction = ui.dragging
  local min_interval = loading and 0.04 or 0.066
  if ui.dragging then
    min_interval = 0.033
  elseif ui.settings_open then
    min_interval = 0.12
  end
  if not immediate and ui.visible and now - (ui.last_draw_at or 0) < min_interval then
    ui.pending_draw = true
    return
  end
  ui.pending_draw = false
  ui.last_draw_at = now
  ui.draw_count = (ui.draw_count or 0) + 1
  if ui.visible and not loading and not state.paused and not ui.settings_open and not ui.dragging and not ui.end_overlay and mp.get_time() - ui.last_interaction > AUTO_HIDE_SECONDS then
    ui.visible = false
    reset_regions()
    mp.set_osd_ass(width, height, "")
    clear_cover_overlay()
    return
  end
  if not ui.visible and not loading and not ui.end_overlay then
    reset_regions()
    clear_cover_overlay()
    return
  end

  reset_regions()
  local mouse = mouse_pos()
  local s = scaled(width, height)
  local ass = assdraw.ass_new()

  if force_minimal_osd then
    draw_smoke_test(ass, width, height, s)
    ui.render_has_run = true
    mp.set_osd_ass(width, height, ass.text)
    return
  end

  if loading then
    if is_loading() then
      maybe_reload_loading_metadata()
    end
    if not ui.native_loading_osd_cleared then
      safe_commandv("show-text", "", "1")
      ui.native_loading_osd_cleared = true
    end
  else
    ui.native_loading_osd_cleared = false
  end
  local cover_info = update_cover_overlay(is_loading(), width, height, s)
  if loading then
    draw_loading(ass, width, height, s, cover_info)
    ui.regions_ready = false
    ui.render_has_run = true
    mp.set_osd_ass(width, height, ass.text)
    if DEBUG_PERF and now - (ui.last_perf_log or 0) > 1 then
      local draw_ms = (mp.get_time() - now) * 1000
      debug_perf(string.format("draws=%d reason=%s loading=true ass=%d ms=%.1f", ui.draw_count or 0, tostring(reason or ""), #ass.text, draw_ms))
      ui.draw_count = 0
      ui.last_perf_log = now
    end
    return
  end

  draw_gradient_top(ass, width, height, s)
  draw_gradient_bottom(ass, width, height, s)
  draw_title_area(ass, width, height, s)
  draw_center_play(ass, width, height, mouse, s)
  draw_settings_panel(ass, width, height, mouse, s)
  draw_timeline(ass, width, height, mouse, s)
  draw_controls(ass, width, height, mouse, s)
  draw_manual_skip_buttons(ass, width, height, mouse, s)
  draw_end_overlay(ass, width, height, mouse, s)

  ui.regions_ready = #regions > 0
  ui.region_width = width
  ui.region_height = height
  ui.render_has_run = true
  mp.set_osd_ass(width, height, ass.text)
  if DEBUG_PERF and now - (ui.last_perf_log or 0) > 1 then
    local draw_ms = (mp.get_time() - now) * 1000
    debug_perf(string.format("draws=%d reason=%s visible=%s menu=%s ass=%d hitboxes=%d ms=%.1f", ui.draw_count or 0, tostring(reason or ""), tostring(ui.visible), tostring(ui.submenu), #ass.text, #regions, draw_ms))
    ui.draw_count = 0
    ui.last_perf_log = now
  end
end

function redraw_for_input()
  show_overlay()
  local width, height = mp.get_osd_size()
  if ui.visible
    and ui.regions_ready
    and #regions > 0
    and ui.region_width == width
    and ui.region_height == height then
    return hit_region()
  end
  draw(true, "input")
  return hit_region()
end

function update_property(name, value, should_show)
  state[name] = value
  if should_show then show_overlay() end
  draw(false, "property:" .. tostring(name))
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
    state.mini_player = true
    state.theater_mode = false
    safe_set_property("fullscreen", "no")
    safe_set_property("ontop", "yes")
    safe_set_property("geometry", MINI_GEOMETRY)
  elseif mode == "theater" then
    state.mini_player = false
    state.theater_mode = true
    safe_set_property("fullscreen", "no")
    safe_set_property("ontop", "yes")
    safe_set_property("geometry", THEATER_GEOMETRY)
  else
    state.mini_player = false
    state.theater_mode = false
    safe_set_property("ontop", "no")
    safe_set_property("geometry", NORMAL_GEOMETRY)
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

function toggle_theater_mode()
  if state.theater_mode then
    set_window_mode("normal")
  else
    set_window_mode("theater")
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
      for _, range in ipairs(ranges) do
        if type(range) == "table" and tonumber(range["end"]) then
          cache_end = math.max(cache_end, tonumber(range["end"]) or 0)
        end
      end
    end
  end
  state.cache_end = cache_end
  state.demuxer_cache_duration = cache_duration
  state.demuxer_underrun = underrun
  if underrun and clean_buffering_percent(demuxer_percent) then
    state.demuxer_buffering_percent = clamp(demuxer_percent, 0, 100)
  else
    state.demuxer_buffering_percent = nil
  end
  log_buffering_transition()
  if not ui.settings_open or is_loading() or is_buffering() then
    draw(false, "demuxer-cache")
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
    return
  end

  local id = region.id
  if id == "settings-panel" then return end
  if id ~= "settings"
    and not starts_with(id, "settings:")
    and not starts_with(id, "speed:")
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
    hide_end_overlay()
    ui.eof_handled_key = ""
    ui.last_next_episode_request_key = ""
    safe_commandv("seek", "0", "absolute+exact")
    safe_set_property_bool("pause", false)
    settings_notice("Replaying episode")
  elseif id == "end_close" then
    hide_end_overlay()
    settings_notice("Episode finished")
  elseif id == "play" or id == "center_play" then
    if ui.end_overlay then hide_end_overlay() end
    mp.commandv("cycle", "pause")
  elseif id == "back" then
    seek_relative(-10)
  elseif id == "forward" then
    seek_relative(10)
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
  elseif id == "theater" then
    toggle_theater_mode()
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
  elseif id == "settings:theater" then
    toggle_theater_mode()
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
      safe_set_property_number("sub-delay", (tonumber(state.sub_delay) or 0) - 0.1)
      ui.submenu = "subs"
    elseif tostring(value) == "delay_up" then
      safe_set_property_number("sub-delay", (tonumber(state.sub_delay) or 0) + 0.1)
      ui.submenu = "subs"
    elseif tostring(value) == "delay_reset" then
      safe_set_property_number("sub-delay", 0)
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
end

function handle_mouse_move()
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
      draw(false, "mouse-hover")
    end
    return
  end
  draw(false, "mouse-move")
end

function handle_mouse_down()
  local region, mouse = redraw_for_input()
  debug_input("down target=" .. tostring(region and region.id or "none"))
  ui.dragging = nil
  clear_drag_preview()
  ui.mouse_down_region = region
  if region and region.id == "seek" then
    begin_drag("seek", mouse)
    set_seek_from_mouse(mouse, false, false)
  elseif region and region.id == "volume" then
    begin_drag("volume", mouse)
    set_volume_from_mouse(mouse, false, false)
  end
  if ui.dragging then
    draw(true, "mouse-down")
  end
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
    local target = region
    if is_settings_region(region) then
      if is_actionable_region(region) then
        target = region
      elseif is_settings_region(down_region) and is_actionable_region(down_region) then
        target = down_region
      end
    elseif down_region and mouse and inside(mouse, down_region.x1, down_region.y1, down_region.x2, down_region.y2) then
      target = down_region
    end
    activate_region(target, mouse)
  end
  ui.dragging = nil
  clear_drag_preview()
  ui.mouse_down_region = nil
  draw(true, "mouse-up")
end

function handle_mouse_press(event)
  local ev = type(event) == "table" and event.event or "press"
  debug_input("mouse event=" .. tostring(ev) .. " overlay=" .. tostring(ui.visible) .. " menu=" .. tostring(ui.submenu) .. " drag=" .. tostring(ui.dragging or "none"))
  if ev == "down" then
    handle_mouse_down()
  elseif ev == "up" then
    handle_mouse_up()
  elseif ev == "press" or ev == nil then
    local region, mouse = redraw_for_input()
    debug_input("press target=" .. tostring(region and region.id or "none"))
    activate_region(region, mouse)
    draw(true, "mouse-press")
  elseif ev == "double" then
    show_overlay()
    ui.settings_open = false
    ui.submenu = "main"
    ui.dragging = nil
    clear_drag_preview()
    ui.mouse_down_region = nil
    safe_commandv("cycle", "fullscreen")
    draw(true, "mouse-double")
  end
end

function handle_wheel(delta)
  show_overlay()
  if ui.settings_open and ui.submenu == "subs" then
    ui.subtitle_menu_scroll = math.max(0, (ui.subtitle_menu_scroll or 0) + delta)
    draw(true, delta > 0 and "wheel-subtitles-down" or "wheel-subtitles-up")
    return
  end
  safe_commandv("add", "volume", delta < 0 and "5" or "-5")
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
  ui.dragging = nil
  clear_drag_preview()
  ui.mouse_down_region = nil
  if ui.end_overlay then
    hide_end_overlay()
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
  else
    ui.visible = false
    reset_regions()
    local width, height = mp.get_osd_size()
    mp.set_osd_ass(width or 1280, height or 720, "")
  end
  draw(true, "escape")
end

mp.observe_property("duration", "number", function(_, value)
  state.duration = value or 0
  if has_playable_media() then
    state.has_started_playback = true
    ui.loading_override_until = 0
  end
  show_overlay()
  draw(true, "duration")
end)
mp.observe_property("time-pos", "number", function(_, value)
  state.pos = value or 0
  if has_playable_media() and state.pos >= 0 then
    state.has_started_playback = true
    ui.loading_override_until = 0
  end
  maybe_auto_skip_intro()
  maybe_auto_skip_outro()
  wake_manual_skip_buttons()
  if not ui.settings_open then
    draw(false, "time-pos")
  end
end)
mp.observe_property("pause", "bool", function(_, value) update_property("paused", value or false, true) end)
mp.observe_property("volume", "number", function(_, value) update_property("volume", value or 100, false) end)
mp.observe_property("mute", "bool", function(_, value) update_property("muted", value or false, false) end)
mp.observe_property("speed", "number", function(_, value)
  mark_menus_dirty("main", "speed", "playback")
  update_property("speed", value or 1, false)
end)
mp.observe_property("idle-active", "bool", function(_, value) update_property("idle", value or false, true) end)
mp.observe_property("core-idle", "bool", function(_, value) update_property("core_idle", value or false, true) end)
mp.observe_property("paused-for-cache", "bool", function(_, value)
  update_property("paused_for_cache", value or false, true)
  log_buffering_transition()
end)
mp.observe_property("fullscreen", "bool", function(_, value)
  if value then
    state.mini_player = false
    state.theater_mode = false
  end
  mark_menu_dirty("main")
  update_property("fullscreen", value or false, false)
end)
mp.observe_property("path", "string", function(_, value)
  local next_path = value or ""
  if next_path ~= state.path then
    reset_skip_range_state()
    reset_end_overlay_state()
    reset_buffering_state()
    ui.marker_log_key = ""
    ui.chapter_state_key = ""
    ui.anim_started = mp.get_time()
    state.has_started_playback = false
    ui.loading_override_until = mp.get_time() + 2.5
  end
  update_property("path", next_path, true)
end)
mp.observe_property("filename", "string", function(_, value) update_property("filename", value or "", false) end)
mp.observe_property("media-title", "string", function(_, value) update_property("title", value or "", true) end)
mp.observe_property("cache-buffering-state", "number", function(_, value)
  local percent = tonumber(value)
  state.cache_percent = percent or 0
  if clean_buffering_percent(percent) then
    state.cache_buffering_active = true
    state.cache_buffering_percent = clamp(percent, 0, 100)
  else
    state.cache_buffering_active = false
    state.cache_buffering_percent = nil
  end
  log_buffering_transition()
  if not ui.settings_open or is_loading() or is_buffering() then
    draw(false, "cache-buffering")
  end
end)
mp.observe_property("demuxer-cache-state", "native", function(_, value) update_demuxer_cache(value) end)
mp.observe_property("demuxer-cache-duration", "number", function(_, value)
  local duration = tonumber(value)
  if duration and duration > 0 then
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
bind("MBTN_LEFT_DBL", "streamnyaa-double-click", function()
  show_overlay()
  ui.settings_open = false
  ui.submenu = "main"
  ui.dragging = nil
  clear_drag_preview()
  ui.mouse_down_region = nil
  safe_commandv("cycle", "fullscreen")
  draw(true, "double-click-binding")
end)
bind("mouse_move", "streamnyaa-mouse-move", handle_mouse_move)
bind("WHEEL_UP", "streamnyaa-wheel-up", function() handle_wheel(-1) end)
bind("WHEEL_DOWN", "streamnyaa-wheel-down", function() handle_wheel(1) end)

bind_key("ESC", "streamnyaa-escape", close_menu_or_overlay)
bind_key("SPACE", "streamnyaa-space", function() show_overlay(); safe_commandv("cycle", "pause"); draw(true, "key-space") end)
bind_key("LEFT", "streamnyaa-left", function() show_overlay(); seek_relative(-10); draw(true, "key-left") end)
bind_key("RIGHT", "streamnyaa-right", function() show_overlay(); seek_relative(10); draw(true, "key-right") end)
bind_key("UP", "streamnyaa-up", function()
  show_overlay()
  safe_commandv("add", "volume", "5")
  mp.add_timeout(0.05, function() emit_player_setting_changed("volume", tostring(mp.get_property_number("volume") or state.volume or 100)) end)
  draw(true, "key-up")
end)
bind_key("DOWN", "streamnyaa-down", function()
  show_overlay()
  safe_commandv("add", "volume", "-5")
  mp.add_timeout(0.05, function() emit_player_setting_changed("volume", tostring(mp.get_property_number("volume") or state.volume or 100)) end)
  draw(true, "key-down")
end)
bind_key("m", "streamnyaa-mute", function()
  show_overlay()
  safe_commandv("cycle", "mute")
  mp.add_timeout(0.05, function() emit_player_setting_changed("muted", mp.get_property_bool("mute") and "true" or "false") end)
  draw(true, "key-mute")
end)
bind_key("c", "streamnyaa-cc", function() show_overlay(); toggle_subtitles(); draw(true, "key-cc") end)
bind_key("C", "streamnyaa-cc-shift", function() show_overlay(); toggle_subtitles(); draw(true, "key-cc-shift") end)
bind_key("a", "streamnyaa-audio", function() show_overlay(); safe_commandv("cycle", "audio"); draw(true, "key-audio") end)
bind_key("S", "streamnyaa-settings", function() show_overlay(); ui.dragging = nil; clear_drag_preview(); ui.settings_open = not ui.settings_open; ui.submenu = "main"; draw(true, "key-settings") end)
bind_key("i", "streamnyaa-skip-intro", function() show_overlay(); skip_intro(); draw(true, "key-skip-intro") end)
bind_key("p", "streamnyaa-pip", function() show_overlay(); toggle_mini_player(); draw(true, "key-mini") end)
bind_key("t", "streamnyaa-theater", function() show_overlay(); toggle_theater_mode(); draw(true, "key-theater") end)
bind_key("f", "streamnyaa-fullscreen", function() show_overlay(); safe_commandv("cycle", "fullscreen"); draw(true, "key-fullscreen") end)
bind_key("[", "streamnyaa-speed-down", function()
  show_overlay()
  safe_commandv("multiply", "speed", "0.9091")
  mp.add_timeout(0.05, function() emit_player_setting_changed("playbackSpeed", tostring(mp.get_property_number("speed") or state.speed or 1)) end)
  draw(true, "key-speed-down")
end)
bind_key("]", "streamnyaa-speed-up", function()
  show_overlay()
  safe_commandv("multiply", "speed", "1.1")
  mp.add_timeout(0.05, function() emit_player_setting_changed("playbackSpeed", tostring(mp.get_property_number("speed") or state.speed or 1)) end)
  draw(true, "key-speed-up")
end)

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
  reset_buffering_state()
  reset_skip_range_state()
  ui.marker_log_key = ""
  ui.chapter_state_key = ""
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
  ui.marker_log_key = ""
  ui.chapter_state_key = ""
  if event and event.reason == "eof" then
    handle_episode_eof()
  else
    hide_end_overlay()
  end
  draw(true, "end-file")
end)
mp.register_event("playback-restart", function()
  show_overlay()
  hide_end_overlay()
  ui.eof_handled_key = ""
  ui.last_next_episode_request_key = ""
  reset_buffering_state()
  reset_skip_range_state()
  draw(true, "playback-restart")
end)

mp.add_periodic_timer(0.05, function()
  local loading = is_loading() or is_buffering()
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

mp.register_script_message("streamnyaa-reload-meta", function(meta_file)
  log_script_message("streamnyaa-reload-meta", meta_file)
  if meta_file and tostring(meta_file) ~= "" then
    script_options.meta_file = tostring(meta_file)
  end
  debug_cover("reload metadata message received: " .. tostring(script_options.meta_file or ""))
  local was_loading = is_loading() or is_buffering()
  load_player_meta()
  msg.info("[StreamNyaa Lua] render requested after metadata reload")
  ui.anim_started = mp.get_time()
  if was_loading or not has_playable_media() then
    ui.loading_override_until = mp.get_time() + 2.5
    state.has_started_playback = false
  end
  show_overlay()
  draw(true, "reload-meta")
end)

mp.register_script_message("streamnyaa-playback-ready", function()
  log_script_message("streamnyaa-playback-ready")
  msg.info("[StreamNyaa Lua] playback-ready received")
  ui.loading_override_until = 0
  state.has_started_playback = true
  show_overlay()
  draw(true, "playback-ready")
end)

load_player_meta()
msg.info("[StreamNyaa Lua] render requested after startup metadata load")
refresh_track_cache(state.tracks)
ui.initialized = true
safe_commandv("script-message", "streamnyaa-lua-ready")
mp.add_timeout(0.35, function()
  safe_commandv("script-message", "streamnyaa-lua-ready")
end)
draw(true, "init")
