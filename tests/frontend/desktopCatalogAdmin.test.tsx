import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import DesktopSettingsSearch from '../../src/components/DesktopSettingsSearch';
import { DesktopCatalogStatus } from '../../src/components/DesktopActivitySummary';
const role = vi.hoisted(() => ({isAdmin:false}));
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>role}));
afterEach(cleanup);
it('hides provider health from signed-out and regular users, and shows it only to admins',()=>{
 const client=new QueryClient();
 const tree=()=> <QueryClientProvider client={client}><DesktopCatalogStatus/></QueryClientProvider>;
 const view=render(tree());expect(screen.queryByRole('button')).toBeNull();
 role.isAdmin=true;view.rerender(tree());expect(screen.getByRole('button',{name:'Activity'})).toBeTruthy();
 role.isAdmin=false;view.rerender(tree());expect(screen.queryByRole('button')).toBeNull();client.clear();
});

it('keeps ordinary settings searchable without exposing diagnostics links',()=>{
 role.isAdmin=false;const view=render(<DesktopSettingsSearch/>);
 expect(screen.queryByRole('link',{name:'Diagnostics & tools'})).toBeNull();
 expect(screen.getByRole('link',{name:'Advanced app paths'})).toBeTruthy();
 role.isAdmin=true;view.rerender(<DesktopSettingsSearch/>);
 expect(screen.getByRole('link',{name:'Diagnostics & tools'}).getAttribute('href')).toBe('#diagnostics');
});
