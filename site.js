'use strict';

(() => {
  const root = document.documentElement;
  root.dataset.js = '';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const themeButton = document.querySelector('.theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  const isDark = () => root.dataset.theme !== 'light';
  const syncTheme = () => {
    const dark = isDark();
    root.toggleAttribute('data-dark', dark);
    themeButton.setAttribute('aria-label', dark ? '切换至浅色模式' : '切换至深色模式');
    themeMeta.content = dark ? '#08090c' : '#fafbfc';
  };
  syncTheme();
  themeButton.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('xiaoyu-field-theme', root.dataset.theme); } catch {}
    syncTheme();
  });
  systemTheme.addEventListener('change', syncTheme);
  window.addEventListener('storage', event => {
    if (event.key !== 'xiaoyu-field-theme') return;
    if (event.newValue === 'light' || event.newValue === 'dark') root.dataset.theme = event.newValue;
    else root.dataset.theme = 'dark';
    syncTheme();
  });

  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('#navigation');
  const setMenu = open => {
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    navigation.toggleAttribute('data-open', open);
  };
  menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  navigation.addEventListener('click', event => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('click', event => {
    if (!navigation.contains(event.target) && !menuButton.contains(event.target)) setMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menuButton.focus();
    }
  });
  const mobileWidth = window.matchMedia('(max-width: 639px)');
  mobileWidth.addEventListener('change', () => setMenu(false));

  const copyButton = document.querySelector('.copy-email');
  const copyStatus = document.querySelector('.copy-status');
  let copyTimer;
  copyButton.addEventListener('click', async () => {
    window.clearTimeout(copyTimer);
    delete copyButton.dataset.copied;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(copyButton.dataset.email);
      copyButton.dataset.copied = '';
      copyButton.setAttribute('aria-label', '邮箱地址已复制');
      copyStatus.textContent = '邮箱地址已复制。';
      copyTimer = window.setTimeout(() => {
        delete copyButton.dataset.copied;
        copyButton.setAttribute('aria-label', '复制邮箱地址');
        copyStatus.textContent = '';
      }, 4000);
    } catch {
      copyButton.setAttribute('aria-label', '复制邮箱地址');
      copyStatus.textContent = '无法自动复制，请选择邮箱地址手动复制。';
    }
  });

  // Reveal only below-the-fold content. Content remains visible without JS.
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0.06 });
    document.querySelectorAll('.reveal').forEach(element => {
      if (element.getBoundingClientRect().top > window.innerHeight && !reducedMotion.matches) {
        element.classList.add('reveal-ready');
        revealObserver.observe(element);
      }
    });
    reducedMotion.addEventListener('change', event => {
      if (event.matches) {
        revealObserver.disconnect();
        document.querySelectorAll('.reveal-ready').forEach(element => element.classList.add('is-visible'));
      }
    });

    const links = [...navigation.querySelectorAll('a')];
    const sectionObserver = new IntersectionObserver(entries => {
      const entry = entries.find(item => item.isIntersecting);
      if (!entry) return;
      for (const link of links) {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }, { rootMargin: '-15% 0px -60% 0px', threshold: 0 });
    document.querySelectorAll('main > section[id]').forEach(section => sectionObserver.observe(section));
  }

  document.querySelector('#year').textContent = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(new Date());
})();
