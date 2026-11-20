import { For } from 'solid-js';
import { Icon } from './icons';

/** One target of an editor lane (velocity, key, pan, shift): its icon and name, coloured by `cls`. */
export interface LaneTarget<T extends string> { id: T; label: string; icon: string; tip: string; cls: string; disabled?: boolean }

/** The icons of the lane targets, shared by the Piano roll and the Channel Rack's graph editor. */
export const LANE_ICONS = {
  vel: 'M5 20v-6 M12 20V9 M19 20V4',
  pan: 'M9 7l-5 5 5 5 M15 7l5 5-5 5',
  key: 'M6 4v16 M12 4v16 M18 4v16 M4 4h16v16H4z',
  shift: 'M4 12h12 M12 7l5 5-5 5 M4 6v12',
};

/**
 * What an editor lane edits: the Piano roll's lane and the Channel Rack's graph editor show the same
 * switch (icon + name, each target in the colour of its handles). `row` lays it out side by side.
 */
export function LaneSwitch<T extends string>(p: { label: string; value: T; items: LaneTarget<T>[]; onPick: (id: T, el: HTMLElement) => void; row?: boolean }) {
  return (
    <div class="laneswitch" classList={{ row: !!p.row }} role="radiogroup" aria-label={p.label}>
      <For each={p.items}>{it => (
        <button role="radio" class={it.cls} aria-checked={p.value === it.id} classList={{ on: p.value === it.id }} disabled={it.disabled} title={it.tip}
          onClick={e => p.onPick(it.id, e.currentTarget)}>
          <Icon d={it.icon} size={12} sw={2.4} /><span>{it.label}</span>
        </button>
      )}</For>
    </div>
  );
}
