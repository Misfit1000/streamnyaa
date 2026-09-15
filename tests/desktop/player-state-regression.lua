local mp = require "mp"
local actual_command = mp.commandv
local now = 1000
local callbacks, properties, commands, messages, observers = {}, {}, {}, {}, {}
local last_ass = ""
local key_callbacks = {}
local periodic_callbacks = {}

-- Load the real skin against a deterministic MPV boundary. Event callbacks,
-- reloads, cache telemetry, and time are exercised without fetching a torrent.
mp.get_time = function() return now end
mp.register_event = function(name, callback)
  callbacks[name] = callbacks[name] or {}
  table.insert(callbacks[name], callback)
end
mp.observe_property = function(name, _, callback) observers[name] = callback end
mp.register_script_message = function(name, callback) messages[name] = callback end
mp.add_periodic_timer = function(_, callback) periodic_callbacks[#periodic_callbacks+1]=callback; return { stop = function() end, resume = function() end } end
mp.add_timeout = function() return { kill = function() end } end
mp.add_key_binding = function() end
mp.add_forced_key_binding = function(key, _, callback) key_callbacks[key] = callback end
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

  reset()
  ui.end_overlay, state.autoplay = true, true
  request_next_episode("ended")
  local request_id = ui.end_request_id
  local sent = #commands
  request_next_episode("manual")
  check(#commands == sent, "Duplicate Next must not dispatch another request")
  messages["streamnyaa-next-episode-status"]("old-request", "failed")
  check(ui.end_next_pending, "Stale request status must not modify the current prompt")
  messages["streamnyaa-next-episode-status"](request_id, "opening")
  check(ui.end_status == "opening" and ui.end_next_pending, "Prompt must reflect actual opening status")
  messages["streamnyaa-next-episode-status"](request_id, "failed")
  check(not ui.end_next_pending and ui.end_status == "failed", "A failed preparation enables retry")
  request_next_episode("manual")
  local retry_id = ui.end_request_id
  check(retry_id ~= request_id, "Retry needs its own request identity")
  hide_end_overlay(true)
  check(commands[#commands][3] == "cancel" and commands[#commands][4] == retry_id, "Dismiss must cancel the exact pending request")
  messages["streamnyaa-next-episode-status"](retry_id, "opening")
  check(not ui.end_overlay and not ui.end_next_pending, "Late status cannot resurrect a dismissed prompt")
  ui.end_overlay, ui.end_request_id = true, "final-episode"
  messages["streamnyaa-next-episode-status"]("final-episode", "unavailable")
  reset_regions()
  local ass = require("mp.assdraw").ass_new()
  draw_end_overlay(ass, 1280, 720, nil, 1)
  check(ass.text:find("You're caught up", 1, true) ~= nil, "Final episode must show caught-up state")
  check(ass.text:find("Next episode", 1, true) == nil, "Final episode must not show an unusable Next action")
  ui.end_status, ui.end_focus = "idle", "end_next_episode"
  for _, viewport in ipairs({{640,360,1}, {1280,720,1}, {1920,1080,2}, {3840,2160,2}}) do
    local p = end_overlay_layout(viewport[1], viewport[2], viewport[3])
    check(p.x >= 16 and p.y >= 16 and p.x + p.w <= viewport[1] - 16 and p.y + p.h <= viewport[2] - 16, "Completion panel must fit the viewport")
    check(math.abs(p.x * 2 + p.w - viewport[1]) < 0.1 and math.abs(p.y * 2 + p.h - viewport[2]) < 0.1, "Completion panel must be centered")
  end
  ass = require("mp.assdraw").ass_new()
  draw_gradient_top(ass, 1280, 720, 1)
  draw_gradient_bottom(ass, 1280, 720, 1)
  check(ass.text == "", "Top and bottom control backgrounds must be fully transparent")
  keyboard_seek(1, "test-focus")
  check(ui.end_focus == "end_replay", "Arrow navigation must move between completion actions")
  keyboard_toggle_pause("test-activate")
  check(not ui.end_overlay, "Space must activate the focused replay action")

  reset()
  state.paused_for_cache, state.paused = false, true
  for _, viewport in ipairs({{640,360,1}, {980,600,2}, {1280,720,1}, {1920,1080,2}, {3840,2160,2}}) do
    local width, height, dpi = viewport[1], viewport[2], viewport[3]
    properties["display-hidpi-scale"] = dpi
    reset_regions()
    ass = require("mp.assdraw").ass_new()
    draw_controls(ass, width, height, nil, scaled(width, height))
    local toolbar = upvalue(add_region, "regions")
    local found = {}
    for i, region in ipairs(toolbar) do
      found[region.id] = true
      check(region.x1 >= 0 and region.y1 >= 0 and region.x2 <= width and region.y2 <= height,
        "Toolbar action must fit the viewport: " .. region.id)
      for j = i + 1, #toolbar do
        local other = toolbar[j]
        check(region.x2 <= other.x1 or other.x2 <= region.x1 or region.y2 <= other.y1 or other.y2 <= region.y1,
          "Toolbar hit areas must not overlap: " .. region.id .. "/" .. other.id)
      end
    end
    check(found.play and found.next_episode and found.mute and found.settings and found.fullscreen,
      "Essential controls must remain reachable at every supported scale")
    reset_regions()
    draw_center_play(ass, width, height, nil, scaled(width, height))
    local center = upvalue(add_region, "regions")[1]
    check(center and math.abs(center.x1 + center.x2 - width) < 0.1 and math.abs(center.y1 + center.y2 - height) < 0.1,
      "Central play action must be centered in the viewport")
    check(center.x2 - center.x1 == 64 * controls_scale(scaled(width, height)), "Central hit target must use logical display scale")
  end
  ass = require("mp.assdraw").ass_new()
  draw_title_area(ass, 1280, 720, 1)
  check(ass.text:find("\\bord1.43", 1, true) ~= nil, "Video title must have a readable outline on bright footage")
  reset()
  properties["window-maximized"] = true
  local function last_window_command(name)
    for i = #commands, 1, -1 do
      if commands[i][1] == "set" and commands[i][2] == name then return commands[i][3] end
    end
  end
  set_window_mode("mini")
  check(last_window_command("window-maximized") == "no" and state.mini_player, "Mini mode must be an explicit window action")
  set_window_mode("normal")
  check(last_window_command("window-maximized") == "yes" and not state.mini_player, "Exiting mini mode must restore maximized state")
  reset()
  properties["fullscreen"] = true
  set_window_mode("mini")
  set_window_mode("normal")
  check(last_window_command("fullscreen") == "yes", "Exiting mini mode must restore prior fullscreen")
  check(input_draw_interval(false, false, "mouse-hover") == 1 / 60, "Pointer hover must not be capped at eight FPS")
  check(input_draw_interval(false, "seek", "timer") == 1 / 60, "Dragging must use the interaction frame budget")
  check(input_draw_interval(false, false, "property:time-pos") == 0.066, "Idle telemetry should keep its efficient redraw budget")
  reset()
  local original_redraw = redraw_for_input
  redraw_for_input = function() return {id = "settings"}, {x = 10, y = 10} end
  local before_double = #commands
  handle_double_click()
  for i = before_double + 1, #commands do
    check(not (commands[i][1] == "cycle" and commands[i][2] == "fullscreen"), "Double clicking a toolbar action must not toggle fullscreen")
  end
  ui.settings_open = false
  redraw_for_input = function() return nil, {x = 500, y = 200} end
  handle_double_click()
  local fullscreen_requested = false
  for i = before_double + 1, #commands do
    if commands[i][1] == "cycle" and commands[i][2] == "fullscreen" then fullscreen_requested = true end
  end
  check(fullscreen_requested, "Double clicking bare video must retain fullscreen")
  redraw_for_input = original_redraw
  reset()
  check(seek_step_seconds() == 10, "Seek buttons must default to ten seconds")
  apply_player_preference("seekStepSeconds", "20")
  check(seek_step_seconds() == 20, "Saved seek preference must update the button number")
  local _, options = build_submenu_rows("seek_step")
  check(#options == 12 and options[1].value == 5 and options[12].value == 60, "Seek menu must provide five through sixty seconds")
  check(options[4].active, "Selected twenty-second option must be marked active")
  local glyph = require("mp.assdraw").ass_new()
  icon_skip(glyph, 50, 50, 24, "FFFFFF", false)
  check(glyph.text:find("20", 1, true) ~= nil, "Seek icon must render the current number")
  apply_player_preference("seekStepSeconds", "100")
  check(seek_step_seconds() == 60, "Seek preference cannot exceed sixty seconds")
  apply_player_preference("seekStepSeconds", "1")
  check(seek_step_seconds() == 5, "Seek preference cannot fall below five seconds")
  messages["streamnyaa-download-status"]("20%")
  check(build_main_settings_rows()[1].label == "Downloads · save episode files", "Player downloads must open the persistent manager")
  check(build_main_settings_rows()[1].value == "Open manager…", "Player must direct transfer management to its independent queue")
  messages["streamnyaa-download-status"]("")
  check(build_main_settings_rows()[1].label == "Downloads · save episode files", "Download manager must remain accessible without an active transfer")

  reset()
  messages["streamnyaa-reload-meta"]()
  check(state.has_started_playback, "Metadata refresh during buffering must retain playback ownership")
  state.paused_for_cache = false
  ui.recovery_terminal = true
  properties["vo-configured"] = true
  properties["video-out-params"] = {w = 1920, h = 1080}
  observers["time-pos"]("time-pos", 120.5)
  check(not ui.recovery_terminal, "Advancing decoded video must dismiss an obsolete Retry screen")
  reset()
  state.paused_for_cache = false
  ui.recovery_terminal = true
  observers["time-pos"]("time-pos", 120.5)
  check(ui.recovery_terminal, "Audio position alone must not hide a video failure")
  messages["streamnyaa-source-generation"]("7")
  messages["streamnyaa-source-generation"]("6")
  messages["streamnyaa-playback-failed"]("6")
  check(not ui.recovery_terminal, "Late source failures must not replace the current stream")
  messages["streamnyaa-playback-failed"]("7")
  check(ui.recovery_terminal, "Current source failures must remain actionable")
  begin_first_video_frame_handoff()
  check(not hold_cover_for_first_video_frame(), "Decoded video must not retain a timed artwork layer")

  reset()
  state.paused_for_cache = false
  ui.visible = false
  ui.recovery_terminal = true
  draw(true, "test-failure")
  check(last_ass ~= "", "Failure fixture must paint a visible overlay")
  ui.recovery_terminal = false
  draw(false, "test-recovered-hidden-controls")
  check(last_ass == "", "Loading-to-playing transition must clear artwork even with hidden controls")

  local function point_at(id)
    for _, region in ipairs(upvalue(add_region, "regions")) do
      if region.id == id then
        properties["mouse-pos"] = {x = (region.x1 + region.x2) / 2, y = (region.y1 + region.y2) / 2}
        return
      end
    end
    error("Missing clickable control: " .. id)
  end
  reset()
  state.paused_for_cache = false
  ui.visible = true
  draw(true, "test-controls")
  for cycle = 1, 30 do
    point_at("settings")
    handle_mouse_down()
    handle_mouse_up()
    check(ui.settings_open, "Settings click must open immediately without a timer")
    point_at("settings:seek_step")
    handle_mouse_down()
    -- Simulate telemetry landing between the two halves of a click.
    state.paused_for_cache = true
    draw(true, "test-buffer-between-click")
    handle_mouse_up()
    check(ui.submenu == "seek_step", "Buffering must not steal the pressed settings row")
    point_at("seek_step:20")
    handle_mouse_down()
    handle_mouse_up()
    check(seek_step_seconds() == 20, "Seek selection must take effect in the release handler")
    state.paused_for_cache = false
    ui.settings_open = false
    ui.submenu = "main"
    draw(true, "test-next-click")
  end
  ui.settings_open = true
  ui.submenu = "seek_step"
  draw(true, "test-all-seek-options")
  local before_scroll = #commands
  for i = 1, 12 do handle_wheel(1) end
  point_at("seek_step:60")
  handle_mouse_down()
  handle_mouse_up()
  check(seek_step_seconds() == 60, "The final seek option must remain clickable in a scrollable menu")
  for i = before_scroll + 1, #commands do
    check(not (commands[i][1] == "add" and commands[i][2] == "volume"), "Scrolling settings must never change volume")
  end
  reset()
  state.paused_for_cache = false
  ui.visible = true
  draw(true, "pressed-toolbar")
  point_at("mute")
  handle_mouse_down()
  state.paused_for_cache = true
  draw(true, "buffer-removes-toolbar")
  local before_release = #commands
  handle_mouse_up()
  local muted = false
  for i = before_release + 1, #commands do
    if commands[i][1] == "cycle" and commands[i][2] == "mute" then muted = true end
  end
  check(muted, "Buffering repaint must not drop the pressed toolbar button")

  reset()
  state.paused_for_cache = false
  ui.visible = true
  draw(true, "cancel-click")
  point_at("settings")
  handle_mouse_press({event = "down"})
  handle_mouse_press({event = "up", canceled = true})
  check(not ui.settings_open and ui.mouse_down_region == nil, "Cancelled input must not activate or retain a press")
  point_at("settings")
  handle_mouse_down()
  point_at("mute")
  handle_mouse_up()
  check(not ui.settings_open, "Release over another button must cancel the original action")

  reset()
  state.paused_for_cache = false
  ui.visible = true
  draw(true, "double-video")
  properties["mouse-pos"] = {x = 100, y = 200}
  local before_double = #commands
  handle_double_click({event = "down"})
  handle_double_click({event = "up"})
  local full_cycles = 0
  for i = before_double + 1, #commands do
    if commands[i][1] == "cycle" and commands[i][2] == "fullscreen" then full_cycles = full_cycles + 1 end
  end
  check(full_cycles == 1, "Complex double-click must change fullscreen exactly once")
  ui.settings_open = true
  draw(true, "double-control")
  point_at("settings:skip")
  local old_skip = state.skip_intro
  handle_double_click({event = "down"})
  handle_double_click({event = "up"})
  check(state.skip_intro ~= old_skip and ui.settings_open, "Rapid control click must activate without closing the menu")

  reset()
  request_next_episode("manual")
  local first_request = ui.end_request_id
  now = now + 31
  check_next_request_timeout()
  check(not ui.end_next_pending and ui.end_status == "failed", "Lost next response must become retryable")
  request_next_episode("manual")
  check(ui.end_request_id ~= first_request and ui.end_next_pending, "Next retry must get a fresh identity")
  messages["streamnyaa-next-episode-status"](first_request, "opening")
  check(ui.end_status == "preparing", "Late response must not take over a newer next request")

  reset()
  state.autoplay = true
  check(set_sleep_timer(15), "Sleep timer must accept an offered duration")
  check(not set_sleep_timer(-1), "Invalid sleep duration must be rejected")
  now = now + 899
  check_sleep_timer()
  check(not ui.sleep_expired, "Sleep timer must not expire early")
  now = now + 1
  check_sleep_timer()
  check(ui.sleep_expired and state.paused and properties.pause == true, "Sleep timer must really pause playback")
  check(state.autoplay, "Sleep timer must preserve the saved autoplay preference")
  local before_next = #commands
  request_next_episode("ended")
  check(#commands == before_next, "Expired timer must prevent automatic next-episode requests")
  set_sleep_timer(0)
  check(not ui.sleep_deadline and not ui.sleep_expired, "Off must cancel and clear the sleep timer")
  reset()
  meta.subtitleOffsetKey = "subtitleOffset.0123456789abcdef0123456789abcdef01234567.2"
  set_release_subtitle_delay(0.4)
  check(properties["sub-delay"] == 0.4, "Subtitle adjustment must apply to MPV immediately")
  local saved = commands[#commands]
  check(saved[2] == "streamnyaa-player-setting-changed" and saved[3] == meta.subtitleOffsetKey, "Subtitle adjustment must persist under release and episode identity")
  set_release_subtitle_delay(1000)
  check(properties["sub-delay"] == 120, "Subtitle delay must be bounded")
  set_release_subtitle_delay(0)
  check(properties["sub-delay"] == 0, "Subtitle timing reset must be saved")
  key_callbacks["x"]()
  check(math.abs(properties["sub-delay"] - 0.1) < 0.001, "Keyboard subtitle later must apply immediately")
  check(commands[#commands][3] == meta.subtitleOffsetKey, "Keyboard subtitle timing must use release persistence")
  key_callbacks["z"]()
  check(math.abs(properties["sub-delay"]) < 0.001, "Keyboard subtitle earlier must reverse the adjustment")
  apply_custom_shortcuts({ pause = "Ctrl+b", fullscreen = "Ctrl+f", mute = "Ctrl+m", back = "Ctrl+j", forward = "Ctrl+l", settings = "Ctrl+s" })
  check(type(key_callbacks["Ctrl+b"]) == "function", "Custom pause must register a real action")
  local before_custom = #commands
  key_callbacks["Ctrl+f"]()
  check(#commands > before_custom, "Custom fullscreen must issue a player command")
  local found_fullscreen = false
  for index = before_custom + 1, #commands do
    if commands[index][1] == "cycle" and commands[index][2] == "fullscreen" then found_fullscreen = true end
  end
  check(found_fullscreen, "Custom fullscreen must change fullscreen, not merely show controls")
  ui.settings_open = false
  key_callbacks["Ctrl+s"]()
  check(ui.settings_open, "Custom Settings must open its real menu")
  -- Drive the real coverage sampler with pause, seek, speed and buffering events.
  mp.get_property_native=function(name,default) if properties[name]~=nil then return properties[name] end return default end
  local sample
  for _, callback in ipairs(periodic_callbacks) do
    for index = 1, 30 do
      local name = debug.getupvalue(callback, index)
      if not name then break end
      if name == "coverage" then sample = callback; break end
    end
  end
  check(type(sample) == "function", "Coverage timer must be registered independently of other timers")
  callbacks["file-loaded"][#callbacks["file-loaded"]]()
  properties["pause"]=false; properties["paused-for-cache"]=false; properties["seeking"]=false; properties["speed"]=1
  properties["time-pos"]=5; sample(); now=now+0.5; properties["time-pos"]=5.5; sample()
  local function coverage() return require("mp.utils").parse_json(properties["user-data/streamnyaa/watched-coverage"]) end
  check(coverage().furthest==5.5,"Actual playback establishes watched coverage")
  event("seek"); properties["time-pos"]=1200; sample()
  check(coverage().furthest==5.5,"A forward seek must not advance Resume")
  now=now+0.5; properties["time-pos"]=1200.5; sample()
  check(coverage().furthest==1200.5 and #coverage().intervals==2,"Playback after seek records only the new segment")
  event("seek"); properties["time-pos"]=5; sample(); now=now+0.5; properties["time-pos"]=5.5; sample()
  check(coverage().furthest==1200.5 and #coverage().intervals==2,"Rewatching neither lowers Resume nor duplicates intervals")
  properties["pause"]=true; now=now+0.5; properties["time-pos"]=1300; sample()
  check(coverage().furthest==1200.5,"Paused seeking is not watched")
  properties["pause"]=false; properties["paused-for-cache"]=true; now=now+0.5; properties["time-pos"]=1400; sample()
  check(coverage().furthest==1200.5,"Buffering is not watched")
  properties["paused-for-cache"]=false; properties["speed"]=2; sample(); now=now+0.5; properties["time-pos"]=1401; sample()
  check(coverage().furthest==1401,"Coverage follows actual playback speed")

end)

if ok then
  mp.msg.info("StreamNyaa player-state regression passed: " .. count .. " assertions")
  actual_command("quit", 0)
else
  mp.msg.error("StreamNyaa player-state regression FAILED: " .. tostring(error_message))
  actual_command("quit", 1)
end
