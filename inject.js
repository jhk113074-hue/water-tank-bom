const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const scriptToInject = `  <script>
    (function() {
      // Auto cache-buster
      fetch('version.json?t=' + new Date().getTime())
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (window.APP_VERSION && data.version && data.version !== window.APP_VERSION) {
            console.log('New version detected:', data.version, 'Current:', window.APP_VERSION);
            var urlParams = new URLSearchParams(window.location.search);
            urlParams.set('v', data.version);
            window.location.replace(window.location.pathname + '?' + urlParams.toString());
          }
        }).catch(function(e) { console.error('Version check failed', e); });
    })();
  </script>\n`;

if (!html.includes('Auto cache-buster')) {
  html = html.replace('</head>', scriptToInject + '</head>');
  fs.writeFileSync('index.html', html);
  console.log('Injected cache-buster.');
}
