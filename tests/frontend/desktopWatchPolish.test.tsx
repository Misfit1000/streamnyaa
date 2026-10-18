import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DesktopDrawer from '../../src/components/DesktopDrawer';
import DesktopActionMenu from '../../src/components/DesktopActionMenu';
import { DesktopWatchNavigation, DesktopWatchPlaybackCard } from '../../src/components/DesktopWatchControls';
import { manualEpisodeTarget } from '../../src/lib/desktopEpisodeInteraction';
import { selectedEligibleSource, selectSourceMode } from '../../src/lib/desktopSourceSelection';
import DesktopWatchEpisodeCard from '../../src/components/DesktopWatchEpisodeCard';
afterEach(cleanup);
describe('Watch presentation without controller duplication',()=>{
  it('keeps the three compact destinations',()=>{
    render(<MemoryRouter><DesktopWatchNavigation /></MemoryRouter>);
    for(const [name,path] of [['Home','/'],['Browse','/search'],['My List','/my-list']]) expect(screen.getByRole('link',{name}).getAttribute('href')).toBe(path);
    expect(screen.getByRole('link',{name:'StreamNyaa'}).querySelector('img')?.getAttribute('src')).toContain('desktop-logo');
  });
  it('keeps artwork and caption separate and dispatches episode actions once',()=>{
    const select=vi.fn(),play=vi.fn();
    const view=render(<DesktopWatchEpisodeCard number={1} title="Episode 1" artwork={{candidates:[],specific:false,specificCount:0,label:'Series artwork'}} state={{started:true,completed:false,positionSeconds:300,progressPercent:12,updatedAt:1}} selected onSelect={select} onPlay={play}/>);
    expect(screen.getByText('1. Episode 1').closest('.sn-watch-episode-image')).toBeNull();
    expect(screen.getByText('Resume')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Play episode 1'}));expect(play).toHaveBeenCalledOnce();expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Watch episode 1'}));expect(select).toHaveBeenCalledOnce();
    expect(view.container.querySelector('.sn-watch-episode-progress')?.getAttribute('style')).toBeNull();
  });
  it('separates Resume from watched coverage and retains both download actions',()=>{
    const play=vi.fn(),release=vi.fn(),files=vi.fn(),options=vi.fn();
    render(<DesktopWatchPlaybackCard episode={3} progress={{started:true,completed:false,positionSeconds:582,progressPercent:20,updatedAt:1}} duration={1440} disabled={false} busy="" sourceSummary="Selected source" onPlay={play} onOptions={options} onDownloadRelease={release} onChooseFiles={files} />);
    expect(screen.getByText(/Resume at 9:42/).textContent).toContain('20% watched');
    fireEvent.click(screen.getByRole('button',{name:'Resume episode 3'}));expect(play).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button',{name:'Open playback options'}));expect(options).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button',{name:'Download episode 3 options'}));
    fireEvent.click(screen.getByRole('menuitem',{name:'Download release'}));expect(release).toHaveBeenCalledOnce();expect(files).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Download episode 3 options'}));
    fireEvent.click(screen.getByRole('menuitem',{name:'Choose files'}));expect(files).toHaveBeenCalledOnce();
  });
  it('offers explicit replay for completed episodes and disables unavailable playback',()=>{
    render(<DesktopWatchPlaybackCard episode={2} progress={{started:true,completed:true,positionSeconds:1420,progressPercent:95,updatedAt:1}} disabled busy="" sourceSummary="No source" onPlay={vi.fn()} onOptions={vi.fn()} />);
    expect(screen.queryByText(/Resume at/)).toBeNull();
    expect((screen.getByRole('button',{name:'Watch again episode 2'}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('allows an explicit jump past stale airing counts and bounds confirmed finished series',()=>{
    expect(manualEpisodeTarget(' 101 ','RELEASING',12)).toBe(101);
    expect(manualEpisodeTarget('101','FINISHED',100)).toBe(100);
    expect(manualEpisodeTarget('101','FINISHED',null)).toBe(101);
    for(const input of ['0','-1','2.5','episode 9','1e4',''])expect(manualEpisodeTarget(input,'RELEASING',12)).toBeNull();
    expect(manualEpisodeTarget('999999','RELEASING',12)).toBe(9999);
  });
  it('invalidates Use when identity, episode or eligibility changes',()=>{
    const source={id:'safe'},key=(item:typeof source)=>item.id,selected={scope:'anime:1:ep:2:balanced:sub',id:'safe'};
    expect(selectedEligibleSource(selected,selected.scope,[source],key)).toBe(source);
    for(const scope of ['anime:2:ep:2:balanced:sub','anime:1:ep:3:balanced:sub','anime:1:ep:2:strict:sub'])expect(selectedEligibleSource(selected,scope,[source],key)).toBeUndefined();
    expect(selectedEligibleSource(selected,selected.scope,[],key)).toBeUndefined();
    expect(selectedEligibleSource(selected,selected.scope,[{id:'other'}],key)).toBeUndefined();
  });
  it('keeps the selected source order while applying classification filters',()=>{
    const rows=[{id:'small',title:'Show 01',matchTier:'exact',playable:true,score:55},{id:'large',title:'Show 01',matchTier:'exact',playable:true,score:90}];
    expect(selectSourceMode(rows,'balanced','sub',source=>source.score,()=>false).map(source=>source.id)).toEqual(['small','large']);
    expect(selectSourceMode(rows,'strict','sub',source=>source.score,()=>false).map(source=>source.id)).toEqual(['large']);
  });
});
describe('drawer and menu keyboard ownership',()=>{
  it('is closed by default, contains focus and restores it after Escape',()=>{
    const close=vi.fn();const opener=document.createElement('button');document.body.append(opener);opener.focus();
    const view=render(<DesktopDrawer open={false} onClose={close} title="Options"><button>Last action</button></DesktopDrawer>);
    expect(screen.queryByRole('dialog')).toBeNull();
    view.rerender(<DesktopDrawer open onClose={close} title="Options"><button>Last action</button><details><summary>Tools</summary><button>Hidden tool</button></details></DesktopDrawer>);
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close Options'}));
    screen.getByText('Tools').focus();fireEvent.keyDown(document.activeElement!,{key:'Tab'});
    expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close Options'}));
    fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledOnce();
    view.rerender(<DesktopDrawer open={false} onClose={close} title="Options"><button>Last action</button></DesktopDrawer>);
    expect(document.activeElement).toBe(opener);opener.remove();
  });
  it('dismisses with outside pointer and Close without firing child actions',()=>{
    const close=vi.fn();render(<DesktopDrawer open onClose={close} title="Options"><button>Inside</button></DesktopDrawer>);
    fireEvent.pointerDown(screen.getByRole('button',{name:'Inside'}));expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Close Options'}));expect(close).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);expect(close).toHaveBeenCalledTimes(2);
  });
  it('lets the menu consume Escape before its containing drawer',()=>{
    const close=vi.fn(),action=vi.fn();render(<DesktopDrawer open onClose={close} title="Options"><DesktopActionMenu label="Source actions" actions={[{label:'Unavailable',action,disabled:true},{label:'Details',action},{label:'Choose files',action}]} /></DesktopDrawer>);
    const trigger=screen.getByRole('button',{name:'Source actions'});fireEvent.keyDown(trigger,{key:'ArrowDown'});
    expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Details'}));
    fireEvent.keyDown(document.activeElement!,{key:'End'});expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Choose files'}));
    fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByRole('menu')).toBeNull();expect(close).not.toHaveBeenCalled();expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger,{key:'Escape'});expect(close).toHaveBeenCalledOnce();expect(action).not.toHaveBeenCalled();
  });
});
