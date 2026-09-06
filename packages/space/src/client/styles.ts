export const sidebarCss = `
.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel{box-sizing:border-box;color:var(--dsw-alias-label-primary,#242424);font:13px/1.5 system-ui,sans-serif;letter-spacing:0}
.dsh-space-root *,.dsh-space-dialog *,.dsh-space-menu-panel *{box-sizing:border-box}
.dsh-space-root{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}
.dsh-space-root button,.dsh-space-dialog button,.dsh-space-menu-panel button{font:inherit}
.dsh-space-root button,.dsh-space-dialog button{cursor:pointer}
.dsh-space-root button:disabled,.dsh-space-dialog button:disabled,.dsh-space-menu-panel button:disabled{opacity:.45;cursor:not-allowed}
.dsh-space-root :focus-visible,.dsh-space-dialog :focus-visible,.dsh-space-menu-panel :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4787e0);outline-offset:2px}
.dsh-space-toolbar{display:flex;align-items:center;flex:none;min-height:38px;gap:4px;padding:3px 10px}
.dsh-space-toolbar-title{flex:1;min-width:0;font-weight:600;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-icon:hover,.dsh-space-menu-panel button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-icon svg{flex:none}
.dsh-space-search-wrap{display:flex;align-items:center;gap:6px;margin:0 10px 8px;padding:0 8px;min-height:32px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:6px;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-search{min-width:0;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary,#242424);height:30px;font:inherit;outline:none}
.dsh-space-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 6px 16px;scrollbar-gutter:stable}
.dsh-space-group{margin:4px 0 10px;min-width:0}
.dsh-space-head{display:flex;align-items:center;gap:2px;min-height:38px;border-radius:6px;padding:2px 3px}
.dsh-space-heading{display:flex;align-items:center;gap:7px;flex:1;min-width:0;padding:4px 0;border:0;background:transparent;color:inherit;text-align:left}
.dsh-space-heading>svg{flex:none;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-heading-text{min-width:0;flex:1}
.dsh-space-title{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-space-meta{display:block;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-session{display:flex;align-items:center;gap:2px;min-width:0;min-height:34px;border-radius:6px;padding:0 3px 0 24px}
.dsh-space-session:hover,.dsh-space-session.current{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-session.current .dsh-space-session-title{font-weight:600}
.dsh-space-session-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1;border:0;background:transparent;text-align:left;color:inherit;padding:6px 0;min-height:32px}
.dsh-space-session-title{flex:1;min-width:0;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.dsh-space-status{display:block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#888);opacity:.4}
.dsh-space-status.running{background:var(--dsw-alias-state-business-primary,#4382d8);opacity:1}
.dsh-space-status.pending{background:var(--dsw-alias-state-warn-primary,#c38c1e);opacity:1}
.dsh-space-status.completed{background:var(--dsw-alias-state-success-primary,#21936b);opacity:1}
.dsh-space-count{font-size:10px;color:var(--dsw-alias-label-tertiary,#777);flex:none}
.dsh-space-member-summary{display:block;width:calc(100% - 28px);margin:0 0 3px 24px;border:0;background:transparent;text-align:left;color:var(--dsw-alias-label-tertiary,#777);font-size:11px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 0}
.dsh-space-head>.dsh-space-icon,.dsh-space-head>.dsh-space-menu,.dsh-space-session>.dsh-space-menu{opacity:0}
.dsh-space-head:hover>.dsh-space-icon,.dsh-space-head:hover>.dsh-space-menu,.dsh-space-head:focus-within>.dsh-space-icon,.dsh-space-head:focus-within>.dsh-space-menu,.dsh-space-session:hover>.dsh-space-menu,.dsh-space-session:focus-within>.dsh-space-menu{opacity:1}
.dsh-space-menu{flex:none;display:inline-flex}
.dsh-space-menu-panel{position:fixed;inset:auto;margin:0;width:190px;max-height:calc(100dvh - 16px);overflow-y:auto;padding:4px;border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 28px #0003}
.dsh-space-menu-panel button{display:flex;align-items:center;gap:9px;width:100%;min-height:32px;padding:5px 8px;text-align:left;color:inherit;border:0;border-radius:4px;background:transparent;cursor:pointer}
.dsh-space-menu-panel button.danger,.dsh-space-error{color:var(--dsw-alias-state-error-primary,#c44242)}
.dsh-space-empty{padding:12px 16px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
.dsh-space-empty-title{display:block;color:var(--dsw-alias-label-secondary,#666);font-weight:600;margin:4px 0 12px}
.dsh-space-notice{padding:8px 12px;font-size:12px;overflow-wrap:anywhere}
.dsh-space-notice button{margin-left:4px}
.dsh-space-muted{color:var(--dsw-alias-label-tertiary,#777);font-size:12px;overflow-wrap:anywhere}
.dsh-space-feedback{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-state-success-primary,#21936b);padding:4px 12px;font-size:11px}
.dsh-space-search-row{display:block;width:100%;padding:8px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left}
.dsh-space-search-row:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-search-row strong,.dsh-space-search-row small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-space-search-row small{color:var(--dsw-alias-label-tertiary,#777);font-size:11px}
.dsh-space-rail{align-items:center;gap:10px;padding-top:8px}
.dsh-space-rail>.dsh-space-icon{width:36px;height:36px}
.dsh-space-dialog{position:fixed;inset:0;margin:auto;width:min(600px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 24px);padding:0;border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 18px 72px #0004}
.dsh-space-dialog::backdrop{background:#0006}
.dsh-space-form{display:flex;flex-direction:column;max-height:calc(100dvh - 26px);margin:0}
.dsh-space-dialog-header{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--dsw-alias-border-l2,#8883);flex:none}
.dsh-space-dialog-header h2{margin:0;flex:1;font-size:16px;font-weight:600;min-width:0;overflow-wrap:anywhere}
.dsh-space-dialog-body{min-height:0;overflow-y:auto}
.dsh-space-fields{display:flex;flex-direction:column;gap:16px;min-width:0;border:0;margin:0;padding:20px}
.dsh-space-fields label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:500;min-width:0}
.dsh-space-fields input,.dsh-space-fields textarea,.dsh-space-fields select{width:100%;min-width:0;min-height:34px;border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:5px;padding:6px 9px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-weight:400}
.dsh-space-fields textarea{min-height:58px;resize:vertical}
.dsh-space-fields input:disabled,.dsh-space-fields textarea:disabled,.dsh-space-fields select:disabled{opacity:.6}
.dsh-space-buttons{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid var(--dsw-alias-border-l2,#8883);flex:none}
.dsh-space-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:5px 12px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:5px;background:transparent;color:inherit;white-space:normal}
.dsh-space-button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-button.primary{background:var(--dsw-alias-label-primary,#292929);color:var(--dsw-alias-bg-layer-1,#fff);border-color:transparent}
.dsh-space-button.danger{background:var(--dsw-alias-state-error-primary,#c44242);color:white;border-color:transparent}
.dsh-space-path-field{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-space-path-field input{flex:1}
.dsh-space-member-list{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2,#8883)}
.dsh-space-member{border-bottom:1px solid var(--dsw-alias-border-l2,#8883);padding:10px 0;min-width:0}
.dsh-space-member-head{display:flex;align-items:center;gap:8px;min-height:38px}
.dsh-space-member-main{flex:1;min-width:0}
.dsh-space-member-main strong,.dsh-space-member-main small{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dsh-space-member-main small{color:var(--dsw-alias-label-tertiary,#777);font-size:11px}
.dsh-space-member-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:10px}
.dsh-space-member-fields>.full{grid-column:1/-1}
.dsh-space-member details>summary{cursor:pointer;font-size:11px;color:var(--dsw-alias-label-secondary,#666);width:fit-content;margin-top:3px}
.dsh-space-primary{color:var(--dsw-alias-state-business-primary,#4382d8)}
.dsh-space-badge{font-size:10px;color:var(--dsw-alias-state-business-primary,#4382d8);font-weight:500;margin-left:6px}
.dsh-space-inline-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsh-space-inline-heading h3{font-size:13px;margin:0}
@media(hover:none){.dsh-space-head>.dsh-space-icon,.dsh-space-head>.dsh-space-menu,.dsh-space-session>.dsh-space-menu{opacity:1}.dsh-space-icon{width:32px;height:32px}.dsh-space-menu-panel button{min-height:40px}}
@media(max-width:480px){.dsh-space-fields{padding:14px;gap:12px}.dsh-space-dialog-header,.dsh-space-buttons{padding:12px 14px}.dsh-space-member-fields{grid-template-columns:1fr}.dsh-space-member-head{gap:4px}}
@media(prefers-reduced-motion:no-preference){.dsh-space-button:disabled svg{animation:dsh-space-spin 1s linear infinite}@keyframes dsh-space-spin{to{transform:rotate(360deg)}}}
`
