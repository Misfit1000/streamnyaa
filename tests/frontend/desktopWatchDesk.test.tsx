import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,it,expect} from 'vitest';
import DesktopWatchDesk from '../../src/components/DesktopWatchDesk';
afterEach(cleanup);
it('keeps watch desk closed until requested and closes on outside click',()=>{
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 const {container}=render(<MemoryRouter><DesktopWatchDesk recent={9} resumable={5}/></MemoryRouter>);const dialog=container.querySelector('dialog')!;
 expect(dialog.open).toBe(false);fireEvent.click(screen.getByText('Watch desk'));expect(dialog.open).toBe(true);expect(screen.getByText(/9 recent episode/)).toBeTruthy();fireEvent.click(dialog);expect(dialog.open).toBe(false);
});
