import { For, Show } from 'solid-js';
import { t } from '../lib/i18n';
import { dismissNotice, holdNotice, notice } from '../state/notice';

/** The transient notice with its follow-up buttons (see `notify`). */
export function Notice() {
  return <Show when={notice()}>{n => (
    <div class="notice-toast" onPointerEnter={() => holdNotice(null)} onPointerLeave={() => holdNotice(4000)}>
      <div class="audio-toast-message" role="status">{n().msg}</div>
      <For each={n().actions}>{a => (
        <button class="smallbtn" classList={{ danger: !!a.danger }} onClick={() => { dismissNotice(); a.act(); }}>{a.label}</button>
      )}</For>
      <button class="ibtn" aria-label={t('d.audio.dismiss')} onClick={dismissNotice}>×</button>
    </div>
  )}</Show>;
}
