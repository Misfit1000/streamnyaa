local mp,utils=require "mp",require "mp.utils"
local output=assert(os.getenv("STREAMNYAA_ARTWORK_RENDER_OUTPUT"))
local directory=utils.split_path(debug.getinfo(1,"S").source:sub(2))
dofile(directory.."/../../desktop/src-tauri/bin/streamnyaa-player.lua")
local function upvalue(fn,name)
  for i=1,80 do local key,value=debug.getupvalue(fn,i);if key==name then return value end end
  error("Missing boundary "..name)
end
local state=upvalue(native_buffering_active,"state")
local ui=upvalue(reset_stall_watchdog,"ui")
local meta=upvalue(active_cover_metadata,"player_meta")
local function capture(name,setup,next)
  setup();draw(true,"artwork-render-"..name)
  mp.add_timeout(.25,function()mp.commandv("screenshot-to-file",output.."/"..name..".png","window");if next then next() else mp.commandv("quit") end end)
end
mp.add_timeout(.7,function()
  capture("loading",function()
    state.path,state.duration,state.pos=meta.loadingImagePath,0,0
    state.has_started_playback,state.idle,state.core_idle=false,false,true
    state.paused,state.paused_for_cache=false,true
    ui.loading_override_until=mp.get_time()+30
    ui.recovery_attempt,ui.recovery_terminal=nil,false
  end,function()
    capture("buffering",function()
      state.path,state.duration,state.pos="render-fixture.mkv",600,120
      state.has_started_playback,state.core_idle=true,false
      state.cache_buffering_active,state.cache_buffering_percent=true,47
      state.demuxer_cache_duration=.47
      ui.loading_override_until,ui.first_video_frame_cover_until=0,0
    end,function()
      capture("settings",function()ui.settings_open,ui.submenu,ui.visible=true,"main",true end,function()
        capture("complete",function()ui.settings_open,ui.end_overlay,ui.end_status=false,true,"idle" end,function()
          capture("long-title",function()
            ui.end_overlay=false
            meta.animeTitle="Reborn as a Space Mercenary: I Woke Up Piloting the Strongest Starship!"
          end,function()
            mp.commandv("loadfile","av://lavfi:testsrc=duration=6:size=640x360:rate=24","replace")
            mp.set_property_bool("pause",false)
            mp.add_timeout(1,function()
              capture("playing",function()
                ui.end_overlay,ui.settings_open,ui.visible=false,false,false
                state.has_started_playback,state.paused_for_cache,state.cache_buffering_active=true,false,false
                state.idle,state.core_idle,state.paused=false,false,false
                ui.loading_override_until,ui.first_video_frame_cover_until=0,0
              end)
            end)
          end)
        end)
      end)
    end)
  end)
end)
