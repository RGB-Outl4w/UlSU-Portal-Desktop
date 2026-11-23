// Shared allowlist for the renderer and Electron's privileged request handler.
const StudySource = (() => {
  const origin = 'https://portal.ulsu.ru';
  const activity = /^\/mod\/(?:page\/view|resource\/view|book\/view|book\/tool\/print\/index)\.php$/;
  const file = /^\/pluginfile\.php\/\d+\/mod_(?:resource|folder|page|book|label)\/.+/;

  function url(value, base = origin) {
    try {
      const u = new URL(value, base);
      if (u.origin !== origin || u.username || u.password || /%(?:2f|5c|00|2e)/i.test(u.pathname)) return null;
      if (file.test(u.pathname)) return origin + u.pathname + (u.searchParams.get('forcedownload') === '1' ? '?forcedownload=1' : '');
      if (!activity.test(u.pathname)) return null;
      const id = u.searchParams.get('id');
      const chapter = u.searchParams.get('chapterid');
      if (!/^\d+$/.test(id || '')) return null;
      return origin + u.pathname + '?id=' + id +
        (u.pathname === '/mod/book/view.php' && /^\d+$/.test(chapter || '') ? '&chapterid=' + chapter : '');
    } catch {
      return null;
    }
  }

  return { url };
})();

if (typeof module === 'object') module.exports = StudySource;
