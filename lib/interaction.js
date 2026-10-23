// Runs inside the page. Return geometry only, never the field's value.
export function readInteraction(point) {
  let hit = point ? document.elementFromPoint(point.x, point.y) : null;
  while (hit?.shadowRoot?.elementFromPoint) {
    const inner = hit.shadowRoot.elementFromPoint(point.x, point.y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  let cursor = hit ? getComputedStyle(hit).cursor : 'default';
  if (cursor === 'auto') cursor = hit?.closest('input:not([type]),input[type=text],input[type=search],input[type=url],input[type=tel],input[type=email],input[type=password],textarea,[contenteditable=true]') ? 'text' : 'default';
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  let caret = null;
  if (document.hasFocus() && active && !active.disabled && !active.readOnly) {
    const style = getComputedStyle(active);
    const field = active.getBoundingClientRect();
    if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && Number.isInteger(active.selectionStart) && active.selectionStart === active.selectionEnd && field.width && field.height) {
      const mirror = document.createElement('div');
      const properties = ['boxSizing','width','height','fontFamily','fontSize','fontWeight','fontStyle','fontVariant','lineHeight','letterSpacing','textTransform','textIndent','textAlign','direction','tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','wordSpacing','overflowWrap','wordBreak'];
      for (const name of properties) mirror.style[name] = style[name];
      Object.assign(mirror.style, { position: 'fixed', left: '0', top: '0', visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden', whiteSpace: active instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre' });
      const value = active.type === 'password' ? '•'.repeat(active.value.length) : active.value;
      mirror.textContent = value.slice(0, active.selectionStart);
      const marker = document.createElement('span'); marker.textContent = '\u200b'; mirror.append(marker);
      document.documentElement.append(mirror);
      try {
        const box = mirror.getBoundingClientRect(), mark = marker.getBoundingClientRect();
        const scaleX = field.width / (active.offsetWidth || field.width), scaleY = field.height / (active.offsetHeight || field.height);
        const height = (parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2);
        let y = mark.top - box.top;
        if (active instanceof HTMLInputElement) y = (active.offsetHeight - height) / 2;
        caret = { x: field.left + (mark.left - box.left - active.scrollLeft) * scaleX, y: field.top + (y - active.scrollTop) * scaleY, height: height * scaleY, color: style.caretColor };
        if (caret.x < field.left || caret.x > field.right || caret.y + caret.height < field.top || caret.y > field.bottom) caret = null;
      } finally { mirror.remove(); }
    } else if (active.isContentEditable) {
      const selection = getSelection();
      if (selection?.isCollapsed && selection.rangeCount && active.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0).cloneRange();
        let rect = range.getClientRects()[0];
        if ((!rect || !rect.height) && selection.anchorNode?.nodeType === Node.TEXT_NODE && selection.anchorOffset > 0) {
          range.setStart(selection.anchorNode, selection.anchorOffset - 1); rect = range.getBoundingClientRect();
          if (rect.height) caret = { x: style.direction === 'rtl' ? rect.left : rect.right, y: rect.top, height: rect.height, color: style.caretColor };
        } else if (rect?.height) caret = { x: rect.left, y: rect.top, height: rect.height, color: style.caretColor };
        if (!caret && !active.textContent) caret = { x: field.left + parseFloat(style.paddingLeft || 0), y: field.top + parseFloat(style.paddingTop || 0), height: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2, color: style.caretColor };
      }
    }
  }
  return { cursor, caret };
}
