import { TestBed } from '@angular/core/testing';
import { DATA_CHANGED_COALESCE_MS, NoticeService } from './notice.service';

describe('NoticeService', () => {
  describe('dataChanged (dados mudaram por fora da tela)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('o primeiro aviso é imediato (nenhum atraso para as telas recarregarem)', () => {
      const notices = TestBed.inject(NoticeService);
      expect(notices.dataChangedCount()).toBe(0);

      notices.dataChanged();

      expect(notices.dataChangedCount()).toBe(1);
    });

    it('uma rajada de avisos (aquecimento, leituras tardias, envio da fila) vira um aviso agora e um só no fim da janela', () => {
      const notices = TestBed.inject(NoticeService);

      notices.dataChanged();
      for (let i = 0; i < 20; i++) {
        jest.advanceTimersByTime(50);
        notices.dataChanged();
      }
      expect(notices.dataChangedCount()).toBe(1);

      jest.advanceTimersByTime(DATA_CHANGED_COALESCE_MS);
      expect(notices.dataChangedCount()).toBe(2);

      // sem novos avisos, nada mais acontece
      jest.advanceTimersByTime(DATA_CHANGED_COALESCE_MS * 3);
      expect(notices.dataChangedCount()).toBe(2);
    });

    it('depois de um período calmo, o aviso seguinte volta a ser imediato', () => {
      const notices = TestBed.inject(NoticeService);
      notices.dataChanged();
      jest.advanceTimersByTime(DATA_CHANGED_COALESCE_MS);

      notices.dataChanged();

      expect(notices.dataChangedCount()).toBe(2);
    });

    it('uma rajada contínua gera no máximo um aviso por janela', () => {
      const notices = TestBed.inject(NoticeService);

      for (let t = 0; t < 10_000; t += 100) {
        notices.dataChanged();
        jest.advanceTimersByTime(100);
      }

      expect(notices.dataChangedCount()).toBeLessThanOrEqual(Math.ceil(10_000 / DATA_CHANGED_COALESCE_MS) + 1);
      expect(notices.dataChangedCount()).toBeGreaterThan(3);
    });
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
