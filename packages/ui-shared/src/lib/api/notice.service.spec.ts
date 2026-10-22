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

  describe('toast (confirmação discreta)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('mostra a mensagem e a remove sozinha depois de alguns segundos', () => {
      const notices = TestBed.inject(NoticeService);
      notices.toast('Pagamento registrado.');
      expect(notices.toasts().map((t) => t.message)).toEqual(['Pagamento registrado.']);
      jest.advanceTimersByTime(6000);
      expect(notices.toasts()).toEqual([]);
    });

    it('com desfazer: executa a ação e fecha o aviso', () => {
      const notices = TestBed.inject(NoticeService);
      const undo = jest.fn();
      notices.toast('Despesa paga.', { undo });
      const [toast] = notices.toasts();
      expect(toast.undo).toBeDefined();
      notices.runUndo(toast.id);
      expect(undo).toHaveBeenCalledTimes(1);
      expect(notices.toasts()).toEqual([]);
    });

    it('empilha no máximo 3, descartando os mais antigos', () => {
      const notices = TestBed.inject(NoticeService);
      for (const m of ['a', 'b', 'c', 'd']) {
        notices.toast(m);
      }
      expect(notices.toasts().map((t) => t.message)).toEqual(['b', 'c', 'd']);
    });

    it('dismissToast fecha só o aviso indicado', () => {
      const notices = TestBed.inject(NoticeService);
      notices.toast('um');
      notices.toast('dois');
      notices.dismissToast(notices.toasts()[0].id);
      expect(notices.toasts().map((t) => t.message)).toEqual(['dois']);
    });
  });
});
