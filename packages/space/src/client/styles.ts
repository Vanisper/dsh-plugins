export const sidebarCss = `
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details){box-sizing:border-box;color:var(--dsw-alias-label-primary,#242424);font:13px/1.5 system-ui,sans-serif;letter-spacing:0}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) *{box-sizing:border-box}
.dsh-space-root{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) button{font:inherit;cursor:pointer}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) button:disabled{opacity:.45;cursor:not-allowed}
:is(.dsh-space-root,.dsh-space-dialog,.dsh-space-menu-panel,.dsh-space-details) :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4787e0);outline-offset:2px}
.dsh-space-toolbar-title{flex:1;min-width:0;font-weight:600;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-view-toolbar{display:flex;align-items:center;gap:2px;padding:6px 8px 0;flex-wrap:wrap}
.dsh-space-toolbar-spacer{flex:1}
.dsh-space-view-switch{display:flex;align-items:center;padding:2px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-view-switch button{display:flex;align-items:center;justify-content:center;gap:4px;min-height:28px;padding:3px 6px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:12px}
.dsh-space-view-switch button[aria-checked=true]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#242424)}
.dsh-space-menu-check{margin-left:auto;display:flex}
.group-color-gray{--group-color:#8a8f98}.group-color-red{--group-color:#d7657c}.group-color-orange{--group-color:#d88b41}.group-color-yellow{--group-color:#c4a526}.group-color-green{--group-color:#31a781}.group-color-blue{--group-color:#4a9ed3}.group-color-purple{--group-color:#9e85d5}
.dsh-space-group-symbol{display:flex;align-items:center;justify-content:center;flex:none;width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,var(--group-color) 20%,transparent);color:var(--group-color)}
.dsh-space-display-group{border-left:2px solid color-mix(in srgb,var(--group-color) 55%,transparent);padding-left:3px}
.dsh-space-group-editor{padding:8px 4px;min-width:0}
.dsh-space-swatches{display:flex;align-items:center;gap:6px;padding-top:8px;flex-wrap:wrap}
.dsh-space-swatches label{position:relative;display:flex!important;align-items:center;justify-content:center;width:24px;height:24px;cursor:pointer}
.dsh-space-swatches input{position:absolute;inset:0;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}
.dsh-space-swatch{display:block;width:16px;height:16px;pointer-events:none;border-radius:50%;background:var(--group-color)}
.dsh-space-swatches input:checked+span{outline:2px solid var(--dsw-alias-label-secondary,#666);outline-offset:3px}
.dsh-space-swatches input:focus-visible+span{outline:2px solid var(--dsw-alias-state-business-primary,#4787e0);outline-offset:3px}
.dsh-space-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666)}
.dsh-space-icon:hover,.dsh-space-menu-panel button:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
.dsh-space-icon svg{flex:none}
.dsh-space-search-wrap{display:flex;align-items:center;gap:6px;margin:8px 10px;padding:0 8px;min-height:32px;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:6px;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-search{min-width:0;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary,#242424);height:30px;font:inherit;outline:none}
.dsh-space-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 6px 16px;scrollbar-gutter:stable}
.dsh-space-group{margin:4px 0 10px;min-width:0}
.dsh-space-section{margin:8px 0 18px;min-width:0}
.dsh-space-section-head{display:flex;align-items:center;gap:2px;min-height:34px;padding:0 3px}
.dsh-space-section-title{display:flex;align-items:center;gap:6px;flex:1;min-width:0;padding:5px 2px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#777);text-align:left;font-size:12px!important}
.dsh-space-section-title svg{flex:none}
.dsh-space-section-empty{padding:4px 6px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
.dsh-space-show-more{display:block;margin:2px 0 4px 20px;padding:4px 6px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#777);font-size:12px!important}
.dsh-space-show-more:hover{color:var(--dsw-alias-label-primary,#242424)}
.dsh-space-head{display:flex;align-items:center;gap:2px;min-height:38px;border-radius:6px;padding:2px 3px}
.dsh-space-heading{display:flex;align-items:center;gap:7px;flex:1;min-width:0;padding:4px 0;border:0;background:transparent;color:inherit;text-align:left}
.dsh-space-heading>svg{flex:none;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-heading-text{min-width:0;flex:1}
.dsh-space-title{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-space-session{display:flex;align-items:center;gap:2px;min-width:0;min-height:34px;border-radius:6px;padding:0 3px 0 24px}
.dsh-space-session.flat{padding-left:6px}
.dsh-space-head:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}
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
:is(.dsh-space-head,.dsh-space-session,.dsh-space-section-head)>:is(.dsh-space-icon,.dsh-space-menu){opacity:0}
:is(.dsh-space-head,.dsh-space-session,.dsh-space-section-head):is(:hover,:focus-within)>:is(.dsh-space-icon,.dsh-space-menu){opacity:1}
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
.dsh-space-directory-row{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-space-directory-row code{display:block;font-size:11px;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-details{position:fixed;inset:auto;margin:0;width:min(320px,calc(100vw - 16px));max-height:calc(100dvh - 16px);overflow:auto;padding:12px;border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 28px #0003}
.dsh-space-details-header{display:flex;align-items:flex-start;gap:4px;margin-bottom:8px}
.dsh-space-details-title{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1;border:0;padding:2px 0;background:transparent;color:inherit;text-align:left;font-weight:600!important;overflow-wrap:anywhere}
.dsh-space-details-title svg{flex:none;color:var(--dsw-alias-label-tertiary,#777)}
.dsh-space-details-body{display:flex;flex-direction:column;gap:8px;border:0;padding:0;margin:0;min-width:0}
.dsh-space-detail-path{display:flex;align-items:flex-start;gap:8px;width:100%;min-width:0;padding:6px 0;border:0;background:transparent;text-align:left;color:inherit;overflow-wrap:anywhere}
.dsh-space-detail-path:hover{color:var(--dsw-alias-state-business-primary,#4382d8)}
.dsh-space-detail-path svg{flex:none;margin-top:2px}
.dsh-space-detail-path code{flex:1;min-width:0;font-size:11px;overflow-wrap:anywhere}
.dsh-space-details-actions{display:flex;align-items:center;justify-content:flex-end;gap:4px;border-top:1px solid var(--dsw-alias-border-l2,#8883);padding-top:6px}
.dsh-space-inline-rename{display:flex;align-items:center;gap:3px;width:100%;min-width:0;margin:0}
.dsh-space-inline-rename input{flex:1;min-width:0;height:32px;padding:4px 6px;border:1px solid var(--dsw-alias-border-l2,#8885);border-radius:4px;background:transparent;color:inherit;font:inherit}
@media(hover:none){:is(.dsh-space-head,.dsh-space-session,.dsh-space-section-head)>:is(.dsh-space-icon,.dsh-space-menu){opacity:1}.dsh-space-icon{width:32px;height:32px}.dsh-space-menu-panel button{min-height:40px}}
@media(max-width:480px){.dsh-space-fields{padding:14px;gap:12px}.dsh-space-dialog-header,.dsh-space-buttons{padding:12px 14px}.dsh-space-member-fields{grid-template-columns:1fr}.dsh-space-member-head{gap:4px}}
@media(prefers-reduced-motion:no-preference){.dsh-space-button:disabled svg{animation:dsh-space-spin 1s linear infinite}@keyframes dsh-space-spin{to{transform:rotate(360deg)}}}
`
