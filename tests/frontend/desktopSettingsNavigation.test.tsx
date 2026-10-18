import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DesktopSettings from '../../src/pages/DesktopSettings';
const role=vi.hoisted(()=>({isAdmin:false}));
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>role}));
afterEach(()=>{cleanup();localStorage.clear();role.isAdmin=false;});

it('keeps category contents and edited paths mounted while navigating',()=>{
  const view=render(<MemoryRouter><DesktopSettings/></MemoryRouter>);
  const nav=screen.getByRole('navigation',{name:'Settings sections'});
  fireEvent.click(within(nav).getByRole('link',{name:'Advanced',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:/Advanced app paths/}));
  const input=screen.getAllByPlaceholderText('Auto', {selector:'input'})[0];
  fireEvent.change(input,{target:{value:'C:\\Tools\\rqbit.exe'}});
  fireEvent.click(within(nav).getByRole('link',{name:'Playback',exact:true}));
  expect(view.container.querySelector('#advanced')?.hasAttribute('hidden')).toBe(true);
  fireEvent.click(within(nav).getByRole('link',{name:'Advanced',exact:true}));
  expect(screen.getByDisplayValue('C:\\Tools\\rqbit.exe')).toBe(input);
  expect(within(nav).queryByRole('link',{name:'Diagnostics'})).toBeNull();
});

it('opens searched categories and keeps notifications, backup and downloads available',()=>{
  const {container}=render(<MemoryRouter initialEntries={['/desktop-settings#updates']}><DesktopSettings/></MemoryRouter>);
  expect(container.querySelector('#updates')?.hasAttribute('hidden')).toBe(false);
  expect(screen.getByRole('button',{name:/Personal alerts/})).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox',{name:'Find a setting'}),{target:{value:'backup'}});
  fireEvent.click(screen.getByRole('link',{name:'Backup, restore & privacy'}));
  expect(screen.getByRole('button',{name:'Export personal backup'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Restore personal backup'})).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox',{name:'Settings category'}),{target:{value:'downloads'}});
  expect(screen.getByRole('button',{name:'Choose folder'})).toBeTruthy();
});
