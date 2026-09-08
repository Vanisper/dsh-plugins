export const draftCss = `
.dsh-space-draft-actions { display:inline-flex; align-items:center; gap:4px; min-width:0; }
.dsh-space-draft-intent-wrap { display:inline-flex; align-items:center; flex-shrink:0; height:20px; margin-inline-start:6px; padding-inline-start:6px; border-inline-start:1px solid var(--dsw-alias-divider,#8883); }
.dsh-space-draft-intent { display:inline-flex; align-items:center; flex-shrink:0; gap:4px; height:28px; padding:4px 6px; border:0; border-radius:6px; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; font-size:13px; line-height:20px; white-space:nowrap; cursor:pointer; }
.dsh-space-draft-intent:hover:not(:disabled),.dsh-space-draft-intent:focus-visible { background:var(--dsw-alias-interactive-bg-hover,#8882); color:var(--dsw-alias-label-primary); }
.dsh-space-draft-intent:focus-visible { outline:2px solid var(--dsw-alias-label-secondary); outline-offset:2px; }
.dsh-space-draft-intent:disabled { opacity:.6; cursor:default; }
.dsh-space-draft-intent-symbol { display:grid; width:16px; height:16px; flex-shrink:0; }
.dsh-space-draft-intent-symbol > span { display:flex; grid-area:1 / 1; }
.dsh-space-draft-intent-cancel { opacity:0; }
.dsh-space-draft-intent:is(:hover,:focus-visible):not(:disabled) .dsh-space-draft-intent-kind { opacity:0; }
.dsh-space-draft-intent:is(:hover,:focus-visible):not(:disabled) .dsh-space-draft-intent-cancel { opacity:1; }
@media (hover:none) {
  .dsh-space-draft-intent:not(:disabled) .dsh-space-draft-intent-kind { opacity:0; }
  .dsh-space-draft-intent:not(:disabled) .dsh-space-draft-intent-cancel { opacity:1; }
}
[data-dsh-draft-command][aria-disabled=true] { opacity:.5; cursor:not-allowed; }
[data-dsh-draft-overlay] div[role=option] { display:grid; grid-template-columns:minmax(0,1fr) auto; row-gap:2px; }
[data-dsh-draft-overlay] div[role=option] > span { grid-column:1; white-space:normal; overflow-wrap:anywhere; }
[data-dsh-draft-overlay] div[role=option] > span:has(svg) { grid-column:2; grid-row:1 / span 2; }
.dsh-space-target-picker { position:fixed; inset:auto; margin:0; display:flex; flex-direction:column; width:min(300px,calc(100vw - 16px)); max-height:360px; padding:5px; box-sizing:border-box; border:1px solid var(--dsw-alias-border-l1,#8883); border-radius:8px; background:var(--dsw-alias-bg-layer-1,#fff); color:var(--dsw-alias-label-primary,#242424); box-shadow:0 8px 28px #0003; font:13px/1.4 system-ui,sans-serif; }
.dsh-space-target-picker:not(:popover-open) { display:none; }
.dsh-space-target-search { display:flex; align-items:center; gap:7px; flex:none; padding:4px 6px 6px; border-bottom:1px solid var(--dsw-alias-border-l2,#8883); color:var(--dsw-alias-label-tertiary,#777); }
.dsh-space-target-search input { flex:1; width:0; min-width:0; min-height:28px; padding:0; border:0; border-radius:0; background:transparent; color:var(--dsw-alias-label-primary,#242424); font:inherit; outline:none; }
.dsh-space-target-search .dsh-space-icon { width:24px; height:24px; }
.dsh-space-target-search .empty { visibility:hidden; }
.dsh-space-target-list { display:flex; flex-direction:column; gap:2px; overflow-y:auto; min-height:0; padding-top:4px; overscroll-behavior:contain; }
.dsh-space-target-picker :is(.dsh-space-target-list,.dsh-space-target-footer)>button { display:flex; align-items:center; gap:9px; flex:none; width:100%; min-height:34px; padding:7px 8px; border:0; border-radius:5px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.dsh-space-target-picker button:is(:hover,:focus-visible) { background:var(--dsw-alias-interactive-bg-hover,#8882); }
.dsh-space-target-list>button[aria-pressed=true] { background:var(--dsw-alias-interactive-bg-hover,#8882); }
.dsh-space-target-picker button:focus-visible { outline:1px solid var(--dsw-alias-state-business-primary,#4787e0); outline-offset:-1px; }
.dsh-space-target-picker button:disabled { opacity:.5; cursor:not-allowed; }
.dsh-space-target-picker button>span { flex:1; min-width:0; }
.dsh-space-target-picker svg { flex-shrink:0; }
.dsh-space-target-list button>span>span,.dsh-space-target-list small { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dsh-space-target-list small { color:var(--dsw-alias-label-tertiary,#777); font-size:11px; margin-top:2px; }
.dsh-space-target-footer { flex:none; border-top:1px solid var(--dsw-alias-border-l2,#8883); margin-top:4px; padding-top:4px; }
.dsh-space-target-footer:empty { display:none; }
.dsh-space-target-status { display:flex; align-items:center; justify-content:center; gap:8px; min-height:52px; margin:0; padding:8px; color:var(--dsw-alias-label-tertiary,#777); }
`
