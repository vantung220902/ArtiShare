/*
 * A stand-in for claude.ai's artifact Share dialog, built from harness/claude-share-dialog.md (what
 * the real one looked like on 2026-11-17). It exists so the in-page "Share lists" box can be tested
 * without signing in and without inviting anyone: choosing its invite option only records the
 * choice in `window.__standIn.invited`, and nothing here touches the network.
 *
 * What is copied from the real dialog: the data-* markers and nesting, the width, the 150 ms of
 * `data-closed`, and how the invite field behaves (a React-controlled combobox: it ignores
 * `input.value = …` and takes the native setter plus a bubbling `input` event or a paste).
 *
 * What is guessed, because nobody has seen the real one do it: that a trailing ", " (an empty
 * entry) gives no option, that duplicates count once, that the owner's own address is not dropped,
 * what choosing the option does next (here: the field is cleared), and what the Export tab holds.
 *
 * Variants by query string: `m=dark`, `noInvite=1` (a dialog without the invite field). The dialog
 * is the page's own (the top-frame variant) or lives in an iframe, depending on the page that
 * includes this file. Page hooks are on `window.__standIn`.
 */
(() => {
  const params = new URLSearchParams(location.search);
  const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
  const OWNER = { name: 'Test Owner', email: 'owner@example.com' };
  const valueProp = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  let mode = params.get('m') === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.mode = mode;
  if (params.get('chrome') === 'none') {
    // What the iframe's <html> carries on the real page.
    document.documentElement.dataset.frameUuid = location.pathname.split('/').pop() ?? '';
    document.documentElement.dataset.embedded = '';
    document.documentElement.dataset.chrome = 'none';
  }

  const state = {
    open: false,
    tab: 'share',
    value: '',
    highlighted: false,
    invites: [
      { id: 'inv-1', email: 'viewer@example.com', role: 'Viewer' },
      { id: 'inv-2', email: 'editor@example.com', role: 'Editor' },
    ],
  };
  let portal = null;
  let closingPortal = null;
  let closingTimer = 0;
  let listboxPortal = null;
  let nextId = 1;

  /** Tiny element builder: `true` makes an empty attribute, `null`/`false` skips it. */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs ?? {})) {
      if (value === false || value == null) continue;
      el.setAttribute(name, value === true ? '' : String(value));
    }
    el.append(...children);
    return el;
  }

  // --- The invite field -------------------------------------------------------------------------

  /**
   * React keeps the last value it saw in a "value tracker": an own `value` property on the node
   * that records what script assigns, so that an `input` event whose value matches is treated as
   * "nothing changed" and dropped. The native prototype setter bypasses the tracker, which is the
   * only reason it works for a script. Emulating it exactly is the point of this stand-in: a plain
   * `input.value = …` plus an event would pass against a naive fake and fail on claude.ai.
   */
  function trackValue(input) {
    const tracker = { seen: '' };
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return valueProp.get.call(this);
      },
      set(next) {
        tracker.seen = String(next);
        valueProp.set.call(this, next);
      },
    });
    return tracker;
  }

  function parseInvite(value) {
    if (!value) return null;
    const entries = value.split(', ');
    if (!entries.every((entry) => EMAIL.test(entry))) return null;
    const have = new Set(state.invites.map((invite) => invite.email.toLowerCase()));
    const emails = [];
    for (const entry of entries) {
      const key = entry.toLowerCase();
      if (have.has(key)) continue;
      have.add(key);
      emails.push(entry);
    }

    return emails.length ? emails : null;
  }

  const inputEl = () => portal?.querySelector('input[role=combobox]') ?? null;

  function setValue(next) {
    state.value = next;
    const input = inputEl();
    if (input) input.value = next;
    syncListbox();
  }

  function removeListbox() {
    listboxPortal?.remove();
    listboxPortal = null;
    state.highlighted = false;
    inputEl()?.setAttribute('aria-expanded', 'false');
    inputEl()?.removeAttribute('aria-activedescendant');
  }

  /** The option claude.ai offers under the field: one portal outside the dialog. */
  function syncListbox() {
    const input = inputEl();
    const emails = input ? parseInvite(state.value) : null;
    if (!input || !emails) {
      removeListbox();
      return;
    }
    if (!listboxPortal) {
      const id = `standin-listbox-${nextId++}`;
      listboxPortal = h(
        'div',
        { 'data-base-ui-portal': '' },
        h('div', { 'data-cds-portal': '', 'data-mode': mode }),
      );
      listboxPortal.firstChild.append(h('div', { role: 'listbox', id, class: 'si-listbox' }));
      document.body.append(listboxPortal);
    }
    const listbox = listboxPortal.querySelector('[role=listbox]');
    const rect = input.getBoundingClientRect();
    listbox.style.left = `${Math.max(8, rect.left)}px`;
    listbox.style.top = `${rect.bottom + 6}px`;
    const title = emails.length === 1 ? `Invite ${emails[0]}` : `Invite ${emails.length} people`;
    const detail = emails.length === 1 ? 'By email' : emails.join(', ');
    const option = h(
      'div',
      {
        role: 'option',
        id: `${listbox.id}-option`,
        class: 'si-option',
        'data-invite-email': emails.join(', '),
        'aria-selected': 'false',
      },
      h('span', null, title),
      h('span', { class: 'si-muted' }, detail),
    );
    option.addEventListener('click', () => choose(emails));
    listbox.replaceChildren(option);
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', listbox.id);
    state.highlighted = false;
  }

  /** What choosing the option does is unknown; here it is only recorded and the field is cleared. */
  function choose(emails) {
    window.__standIn.invited.push({ emails: [...emails] });
    setValue('');
  }

  function highlightOption() {
    const option = listboxPortal?.querySelector('[role=option]');
    if (!option) return;
    state.highlighted = true;
    option.setAttribute('data-highlighted', '');
    option.setAttribute('aria-selected', 'true');
    inputEl()?.setAttribute('aria-activedescendant', option.id);
  }

  function wireInput(input) {
    const tracker = trackValue(input);
    input.value = state.value;

    input.addEventListener('input', () => {
      const actual = valueProp.get.call(input);
      if (actual === tracker.seen) return; // React: nothing changed, so no state update
      tracker.seen = actual;
      state.value = actual;
      syncListbox();
    });

    // claude.ai cancels a paste and appends the text to what is there, joined with ", ".
    input.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text/plain');
      if (text == null) return;
      event.preventDefault();
      const pasted = text.trim();
      if (pasted) setValue(state.value ? `${state.value}, ${pasted}` : pasted);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && listboxPortal) {
        event.preventDefault();
        highlightOption();
      } else if (event.key === 'Enter' && state.highlighted) {
        event.preventDefault();
        const emails = parseInvite(state.value);
        if (emails) choose(emails);
      }
    });
  }

  // --- The dialog -------------------------------------------------------------------------------

  function buildPinned() {
    const pinned = h('div', { 'data-share-pinned': '', class: 'si-pinned' });
    if (!params.has('noInvite')) {
      const input = h('input', {
        type: 'text',
        role: 'combobox',
        'aria-label': 'Invite people by email',
        placeholder: 'Invite people by email',
        inputmode: 'email',
        'aria-haspopup': 'listbox',
        'aria-expanded': 'false',
        autocomplete: 'off',
      });
      wireInput(input);
      pinned.append(
        h(
          'div',
          { 'data-share-entry': '' },
          h(
            'div',
            { 'data-invite-field': '', class: 'si-field' },
            h('div', { 'data-invite-chips': '' }, input),
            h('input', { type: 'hidden' }),
            h('span', { role: 'status' }),
          ),
        ),
      );
    }
    pinned.append(h('span', { class: 'si-section' }, 'People with access'));
    pinned.hidden = state.tab === 'export';

    return pinned;
  }

  function buildInvitees() {
    const list = h('div', { role: 'list' });
    for (const invite of state.invites) {
      const remove = h(
        'button',
        {
          'aria-label': `Remove ${invite.email}`,
          'data-share-remove': '',
          class: 'si-icon-btn',
        },
        '×',
      );
      remove.addEventListener('click', () => {
        state.invites = state.invites.filter((other) => other.id !== invite.id);
        portal.querySelector('[data-ext-invites]').replaceWith(buildInvitees());
        syncListbox();
      });
      list.append(
        h(
          'div',
          { role: 'listitem', class: 'si-row' },
          h(
            'div',
            { style: 'flex:1;min-width:0' },
            h('span', { 'data-name': '' }, invite.email),
            h('div', { class: 'si-muted' }, 'Invited · expires Dec 11'),
          ),
          h(
            'span',
            { 'data-invite-role-sel': invite.id },
            h('button', { role: 'combobox', class: 'si-pill' }, invite.role),
          ),
          h('button', { 'data-invite-copy-link': invite.id, class: 'si-icon-btn' }, 'Link'),
          remove,
        ),
      );
    }

    return h('div', { 'data-ext-invites': '' }, h('span', { class: 'si-section' }, 'Invited by email'), list);
  }

  function buildDialog() {
    const titleId = `standin-title-${nextId++}`;
    const close = h('button', { 'aria-label': 'Close', 'data-share-close': '', class: 'si-icon-btn' }, '×');
    close.addEventListener('click', closeDialog);

    const radios = ['Share', 'Export'].map((label) => {
      const radio = h('span', { role: 'radio', tabindex: '0' }, label);
      const pick = () => {
        state.tab = label.toLowerCase();
        applyTab();
      };
      radio.addEventListener('click', pick);
      radio.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pick();
        }
      });

      return radio;
    });

    const copy = h('button', { 'data-copy-link': '', class: 'si-pill' }, 'Copy link');
    copy.addEventListener('click', () => {
      window.__standIn.copied += 1; // the real one writes the clipboard; the stand-in only counts
    });

    const view = h(
      'div',
      { 'data-share-view': 'main', 'data-share-tab-up': state.tab, class: 'si-view' },
      h(
        'div',
        { 'data-share-export': '' },
        h('p', null, 'Download this artifact'),
        h('button', { class: 'si-pill' }, 'Download'),
      ),
      h(
        'div',
        { 'data-invitees': '', role: 'list' },
        h(
          'div',
          { role: 'listitem', class: 'si-row' },
          h(
            'div',
            { style: 'flex:1;min-width:0' },
            h('span', { 'data-name': '' }, OWNER.name),
            ' (you)',
            h('div', { class: 'si-muted' }, OWNER.email),
          ),
          h('button', { role: 'combobox', 'data-disabled': '', class: 'si-pill' }, 'Owner'),
        ),
      ),
      buildInvitees(),
      h(
        'div',
        { 'data-general-access': '' },
        h('span', { class: 'si-section' }, 'General access'),
        h('div', { class: 'si-muted' }, 'Only people invited'),
      ),
      h(
        'div',
        { 'data-list-visibility': '', 'data-share-settings': '', class: 'si-row' },
        h('span', { 'data-name': '' }, 'Show in Artifacts list'),
        h(
          'button',
          {
            role: 'switch',
            'aria-checked': 'false',
            'aria-label': 'Show in Artifacts list',
            class: 'si-pill',
          },
          'Off',
        ),
      ),
    );

    const dialog = h(
      'div',
      {
        role: 'dialog',
        'data-share-pop': '',
        'data-open': '',
        'aria-labelledby': titleId,
        tabindex: '-1',
        class: 'si-pop',
      },
      h(
        'div',
        { 'data-cds-popover-body': '' },
        h(
          'div',
          { 'data-share-body': '', class: 'si-body' },
          h(
            'div',
            { 'data-share-head': '' },
            h(
              'div',
              { 'data-share-title-row': '', class: 'si-title-row' },
              h('h2', { id: titleId }, 'Test Artifact'),
              h(
                'button',
                {
                  'aria-label': 'Share artifact settings',
                  'data-share-settings-btn': '',
                  class: 'si-icon-btn',
                },
                '⚙',
              ),
              close,
            ),
            h(
              'div',
              { 'data-share-tabs': '', class: 'si-tabs' },
              h('div', { role: 'radiogroup', 'aria-label': 'Share or export' }, ...radios),
            ),
          ),
          buildPinned(),
          view,
        ),
        h(
          'div',
          { 'data-share-footer': '', class: 'si-footer' },
          h('p', { 'data-share-audience-line': '' }, 'Only people invited can open this link'),
          copy,
        ),
      ),
    );

    return h(
      'div',
      { 'data-base-ui-portal': '' },
      h(
        'div',
        { 'data-cds-portal': '', 'data-mode': mode },
        h(
          'div',
          {
            role: 'presentation',
            'data-open': '',
            'data-side': 'bottom',
            'data-align': 'end',
            class: 'si-positioner',
          },
          dialog,
        ),
      ),
    );
  }

  function applyTab() {
    if (!portal) return;
    const exporting = state.tab === 'export';
    portal.querySelector('[data-share-pinned]').hidden = exporting;
    const view = portal.querySelector('[data-share-view]');
    view.dataset.shareTabUp = state.tab;
    view.querySelector('[data-share-export]').hidden = !exporting;
    for (const selector of ['[data-invitees]', '[data-ext-invites]', '[data-general-access]']) {
      view.querySelector(selector).hidden = exporting;
    }
    for (const radio of portal.querySelectorAll('[role=radio]')) {
      const checked = radio.textContent.toLowerCase() === state.tab;
      radio.toggleAttribute('data-checked', checked);
      radio.toggleAttribute('data-unchecked', !checked);
    }
    // The field is gone from view, so its suggestion goes with it.
    if (exporting) removeListbox();
    else syncListbox();
  }

  function openDialog() {
    // A dialog still animating out is replaced, not stacked next to the new one.
    clearTimeout(closingTimer);
    closingPortal?.remove();
    closingPortal = null;
    portal?.remove();
    removeListbox();
    state.value = '';
    state.tab = 'share';
    state.open = true;
    portal = buildDialog();
    document.body.append(portal);
    applyTab();
    portal.querySelector('[role=dialog]').focus();
  }

  function closeDialog() {
    if (!portal) return;
    const leaving = portal;
    portal = null;
    state.open = false;
    removeListbox();
    for (const el of leaving.querySelectorAll('[data-open]')) {
      el.removeAttribute('data-open');
      el.setAttribute('data-closed', '');
    }
    closingPortal = leaving;
    closingTimer = setTimeout(() => {
      leaving.remove();
      if (closingPortal === leaving) closingPortal = null;
    }, 150);
  }

  function setMode(next) {
    mode = next;
    document.documentElement.dataset.mode = next;
    for (const el of document.querySelectorAll('[data-cds-portal]')) el.dataset.mode = next;
  }

  /** React remounting the pinned area: new elements, the same state (the field's text survives). */
  function rerenderPinned() {
    const old = portal?.querySelector('[data-share-pinned]');
    if (!old) return;
    old.replaceWith(buildPinned());
    syncListbox();
  }

  window.__standIn = {
    /** Every time the invite option was chosen: `{ emails }`. Nothing is ever sent. */
    invited: [],
    /** How many times Copy link was clicked. */
    copied: 0,
    open: openDialog,
    close: closeDialog,
    setMode,
    rerenderPinned,
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && portal) closeDialog();
  });

  // A press outside the dialog and outside the suggestion list closes it. The Share button toggles
  // nothing by itself: it is left out so that pressing it never closes and reopens in one go.
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!portal || !(target instanceof Node)) return;
    if (portal.contains(target) || listboxPortal?.contains(target)) return;
    if (target instanceof Element && target.closest('[data-stand-in-share]')) return;
    closeDialog();
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || window.parent === window) return;
    const type = event.data?.standIn;
    if (type === 'open-share') openDialog();
    else if (type === 'outside-pointer') closeDialog();
  });
})();
