import { TestBed } from '@angular/core/testing';
import { NoticeService } from './notice.service';

describe('NoticeService', () => {
  it('avisa as telas que os dados mudaram (ex.: operações pendentes foram enviadas)', () => {
    const notices = TestBed.inject(NoticeService);
    expect(notices.dataChangedCount()).toBe(0);

    notices.dataChanged();
    notices.dataChanged();

    expect(notices.dataChangedCount()).toBe(2);
  });
});
