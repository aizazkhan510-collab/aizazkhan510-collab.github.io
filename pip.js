// Pip studio: animated, narrated preschool videos ("Little Pip") for the YouTube Agent manager.
// Loaded after manager.html's main script and uses its globals ($, esc, toast, token, channel, videos,
// askClaude, uploadVideo, playGeneratedMusic, MOODS, KEY_STORE, loadVideos).
(function () {
  var TTS_STORE = 'ytAgentTtsKey', EL_STORE = 'ytAgentElevenKey', EL_VOICE_STORE = 'ytAgentElevenVoice';
  var FREE_VOICE_STORE = 'ytAgentFreeVoice', PITCH_STORE = 'ytAgentVoicePitch';
  var KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm', KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  var kokoroLoading = null;
  var PLAYLIST_NAME = 'Learn with Pip';
  var BGS = ['sky', 'meadow', 'night', 'room', 'ocean'];
  var POSES = ['wave', 'happy', 'surprised', 'dance', 'sleepy'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'balloon', 'apple', 'sun', 'moon',
    'fish', 'flower', 'cloud', 'rainbow'];
  var RAINBOW = ['#e63946', '#f77f00', '#fcbf49', '#43aa8b', '#277da1', '#7b2cbf'];
  var PLANNED = ['Pip and the Missing Rainbow (learn colors)', 'Shapes Hide-and-Seek: circle, square, triangle',
    'Counting 1 to 10 with Pip\'s Balloons', 'Mixing Colors: red and yellow make orange',
    'Goodnight Moon, Goodnight Stars (bedtime)'];

  var STORY_SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['titleOptions', 'title', 'description', 'tags', 'thumbnailText', 'scenes'],
    properties: {
      titleOptions: { type: 'array', items: { type: 'string' } },
      title: { type: 'string' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      thumbnailText: { type: 'string' },
      scenes: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['narration', 'background', 'pip', 'caption', 'items'],
        properties: {
          narration: { type: 'string' },
          background: { type: 'string', enum: BGS },
          pip: { type: 'string', enum: POSES },
          caption: { type: 'string' },
          items: { type: 'array', items: {
            type: 'object', additionalProperties: false, required: ['shape', 'color', 'count'],
            properties: { shape: { type: 'string', enum: SHAPES }, color: { type: 'string' }, count: { type: 'integer' } }
          } }
        }
      } }
    }
  };

  var KIDS_SYSTEM = [
    'You write episodes of "Little Pip", an original animated learning show for children aged 2 to 5.',
    'Pip is a small, round, sunny-yellow explorer with big eyes, about five years old: curious, kind, playful and gentle. Pip calls the viewers "friends" and learns together with them.',
    'Pip tells the whole story in the first person, the way a cheerful child talks ("Hi friends! I\'m Pip! Ooh, look what I found!"): Pip describes what Pip sees and does, asks the viewers simple questions, leaves a moment for them to answer ("Can you say red? ... Red!") and cheers them on. There is no outside narrator.',
    'An episode is a list of scenes. Each scene has narration (spoken aloud by Pip\'s voice) and simple visuals drawn by code from a fixed vocabulary:',
    '- background: sky, meadow, night, room or ocean.',
    '- pip (Pip\'s pose): wave, happy, surprised, dance or sleepy.',
    '- items: objects shown next to Pip, each with a shape, a hex colour matching the colour named in the narration, and a count (1-10). Show at most 2 item groups and 10 objects in total per scene. Items pop in one by one, so counting scenes should show exactly the number being counted. For "rainbow", count is how many colour bands are filled in (1-6; the rest are grey), so a rainbow can fill up over several scenes.',
    '- caption: one or two big words shown on screen (like "RED", "3" or "CIRCLE"), or an empty string.',
    'Rules: 10-14 scenes, about 2.5-4 minutes in total. Narration uses short, simple words and 1-3 short sentences per scene, and repeats the key word (colour, shape or number) twice. Open with Pip waving: "Hi friends!" plus a small problem or goal. Give the episode a clear beginning, middle and satisfying end, then a short recap and a goodbye with Pip waving.',
    'Keep it calm, warm and accurate. Nothing scary, unsafe or sad without comfort; no brands, no asking children to comment, subscribe, share or give personal information. Bedtime episodes use the night background and slower, softer narration.',
    'Return 3 title options plus the final title (under 70 characters, clear and honest, may end with one emoji), a parent-facing description of 2-3 sentences with 3 hashtags, 8-12 tags, and 1-3 words of thumbnail text.'
  ].join('\n');

  var KIDS_TOPICS_SYSTEM = 'You plan episodes of "Little Pip", an original learning show for children aged 2-5 (colours, shapes, counting, opposites, patterns, feelings, kindness, bedtime). '
    + 'Suggest specific, age-appropriate episode topics that can be shown with simple objects (circles, squares, triangles, stars, hearts, balloons, apples, sun, moon, fish, flowers, clouds, rainbows). '
    + 'Each topic must differ from the others and from past episodes. Return each as a short phrase.';

  // ---------- drawing ----------
  function shade(hex, f) {
    var n = parseInt((hex || '#888888').replace('#', '').slice(0, 6), 16);
    if (isNaN(n)) n = 0x888888;
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var m = function (c) { return Math.max(0, Math.min(255, Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f))); };
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }
  function isLight(hex) {
    var n = parseInt((hex || '').replace('#', '').slice(0, 6), 16);
    if (isNaN(n)) return false;
    return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 190;
  }
  function easeOutBack(p) { var c = 1.7; p = Math.max(0, Math.min(1, p)); return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function blob(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x - s * 0.6, y, s * 0.5, 0, Math.PI * 2); ctx.arc(x, y - s * 0.3, s * 0.65, 0, Math.PI * 2);
    ctx.arc(x + s * 0.6, y, s * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawBg(ctx, W, H, kind, t) {
    var g, i;
    if (kind === 'night') {
      g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1d3a'); g.addColorStop(1, '#23407a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (i = 0; i < 40; i++) {
        ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.5 + i));
        ctx.fillStyle = '#fff8d6'; ctx.beginPath(); ctx.arc((i * 337) % W, (i * 173) % (H * 0.7), 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1b3260'; ctx.fillRect(0, H * 0.84, W, H * 0.16);
    } else if (kind === 'ocean') {
      g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9fdcff'); g.addColorStop(1, '#2479c2');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (i = 0; i < 12; i++) {
        var by = H - ((t * 40 + i * 97) % H);
        ctx.beginPath(); ctx.arc((i * 211) % W, by, 4 + (i % 4) * 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#f2d59b'; ctx.fillRect(0, H * 0.88, W, H * 0.12);
    } else if (kind === 'room') {
      ctx.fillStyle = '#fde9d9'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e8c39e'; ctx.fillRect(0, H * 0.8, W, H * 0.2);
      ctx.fillStyle = '#cfeeff'; rr(ctx, W * 0.72, H * 0.1, W * 0.18, H * 0.26, 14); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.stroke();
    } else {
      var meadow = kind === 'meadow';
      g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, meadow ? '#dff7d0' : '#bfe9ff'); g.addColorStop(1, '#f2fbff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      blob(ctx, (W * 0.2 + t * 12) % (W + 200) - 100, H * 0.14, 46);
      blob(ctx, (W * 0.7 + t * 8) % (W + 200) - 100, H * 0.22, 36);
      ctx.fillStyle = meadow ? '#7ccf6b' : '#9be08a';
      ctx.beginPath(); ctx.moveTo(0, H * 0.8); ctx.quadraticCurveTo(W * 0.5, H * (meadow ? 0.7 : 0.76), W, H * 0.8);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    }
  }

  var moonCache = {};
  function moonSprite(color, s) {
    var key = color + s;
    if (moonCache[key]) return moonCache[key];
    var c = document.createElement('canvas'); c.width = c.height = Math.ceil(s * 2.2);
    var x = c.getContext('2d'), m = c.width / 2;
    x.fillStyle = color; x.beginPath(); x.arc(m, m, s, 0, Math.PI * 2); x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.arc(m + s * 0.5, m - s * 0.2, s * 0.85, 0, Math.PI * 2); x.fill();
    return (moonCache[key] = c);
  }

  function drawShape(ctx, shape, x, y, s, color, t, bands) {
    var i, a;
    ctx.save();
    ctx.lineWidth = Math.max(2, s * 0.08); ctx.strokeStyle = shade(color, -0.3); ctx.fillStyle = color;
    switch (shape) {
      case 'square': rr(ctx, x - s, y - s, s * 2, s * 2, s * 0.22); ctx.fill(); ctx.stroke(); break;
      case 'triangle':
        ctx.beginPath(); ctx.moveTo(x, y - s * 1.05); ctx.lineTo(x + s * 1.1, y + s * 0.85); ctx.lineTo(x - s * 1.1, y + s * 0.85);
        ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'star':
        ctx.beginPath();
        for (i = 0; i < 10; i++) {
          a = -Math.PI / 2 + i * Math.PI / 5;
          var rad = i % 2 ? s * 0.45 : s * 1.1;
          ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'heart':
        ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
        ctx.bezierCurveTo(x - s * 1.6, y - s * 0.1, x - s * 0.7, y - s * 1.3, x, y - s * 0.45);
        ctx.bezierCurveTo(x + s * 0.7, y - s * 1.3, x + s * 1.6, y - s * 0.1, x, y + s * 0.9);
        ctx.fill(); ctx.stroke(); break;
      case 'balloon':
        ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + s * 0.95);
        ctx.quadraticCurveTo(x + Math.sin(t * 3) * 8, y + s * 1.6, x, y + s * 2.1); ctx.stroke();
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, s * 0.8, s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(x - s * 0.3, y - s * 0.4, s * 0.15, s * 0.25, -0.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'apple':
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = s * 0.12; ctx.beginPath(); ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x + s * 0.1, y - s * 1.3); ctx.stroke();
        ctx.fillStyle = '#43aa8b'; ctx.beginPath(); ctx.ellipse(x + s * 0.4, y - s * 1.15, s * 0.35, s * 0.16, -0.5, 0, Math.PI * 2); ctx.fill();
        break;
      case 'sun':
        ctx.strokeStyle = color; ctx.lineWidth = s * 0.14;
        for (i = 0; i < 10; i++) {
          a = i * Math.PI / 5 + t * 0.5;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 1.2, y + Math.sin(a) * s * 1.2);
          ctx.lineTo(x + Math.cos(a) * s * 1.6, y + Math.sin(a) * s * 1.6); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); break;
      case 'moon':
        var sp = moonSprite(color, Math.round(s)); ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2); break;
      case 'fish':
        ctx.beginPath(); ctx.moveTo(x - s * 0.7, y); ctx.lineTo(x - s * 1.4, y - s * 0.6); ctx.lineTo(x - s * 1.4, y + s * 0.6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.65, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + s * 0.5, y - s * 0.15, s * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x + s * 0.55, y - s * 0.15, s * 0.09, 0, Math.PI * 2); ctx.fill();
        break;
      case 'flower':
        ctx.strokeStyle = '#43aa8b'; ctx.lineWidth = s * 0.15; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + s * 1.8); ctx.stroke();
        ctx.fillStyle = color;
        for (i = 0; i < 6; i++) { a = i * Math.PI / 3; ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.45, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, Math.PI * 2); ctx.fill(); break;
      case 'cloud': ctx.fillStyle = color; blob(ctx, x, y, s * 0.9); break;
      case 'rainbow':
        for (i = 0; i < 6; i++) {
          ctx.strokeStyle = i < bands ? RAINBOW[i] : '#c9ccd3'; ctx.lineWidth = s * 0.16;
          ctx.beginPath(); ctx.arc(x, y + s * 0.6, s * (1.6 - i * 0.17), Math.PI, 0); ctx.stroke();
        }
        break;
      default: ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawPip(ctx, x, y, r, pose, t, talking) {
    var bob = Math.sin(t * 2.2) * r * 0.04, tilt = 0;
    if (pose === 'dance') { bob = -Math.abs(Math.sin(t * 5)) * r * 0.18; tilt = Math.sin(t * 5) * 0.12; }
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(tilt);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, r * 1.05 - bob, r * 0.8, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59f00';
    ctx.beginPath(); ctx.ellipse(-r * 0.4, r * 0.95, r * 0.28, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.4, r * 0.95, r * 0.28, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f59f00'; ctx.lineWidth = r * 0.11; ctx.lineCap = 'round';
    var wave = pose === 'wave' ? Math.sin(t * 8) * 0.5 : pose === 'dance' ? Math.sin(t * 5) * 0.6 : 0;
    ctx.beginPath(); ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * 1.35, r * 0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.9, 0);
    ctx.lineTo(r * 0.9 + Math.cos(-0.9 + wave) * r * 0.55, Math.sin(-0.9 + wave) * r * 0.55 - (pose === 'wave' || pose === 'dance' ? r * 0.1 : -r * 0.6)); ctx.stroke();
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#fff3a3'); g.addColorStop(1, '#ffd43b');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f59f00'; ctx.lineWidth = r * 0.05; ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,150,.45)';
    ctx.beginPath(); ctx.arc(-r * 0.55, r * 0.2, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.55, r * 0.2, r * 0.14, 0, Math.PI * 2); ctx.fill();
    var blink = (t % 3.2) < 0.12 || pose === 'sleepy';
    [-1, 1].forEach(function (sd) {
      var ex = sd * r * 0.32, ey = -r * 0.15;
      if (blink) {
        ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = r * 0.05;
        ctx.beginPath(); ctx.arc(ex, ey, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      } else {
        var big = pose === 'surprised' ? 1.25 : 1;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.17 * big, r * 0.21 * big, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(ex + r * 0.03, ey + r * 0.03, r * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + r * 0.07, ey - r * 0.03, r * 0.035, 0, Math.PI * 2); ctx.fill();
      }
    });
    ctx.fillStyle = '#c2410c'; ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = r * 0.04;
    if (talking) {
      var open = 0.06 + Math.abs(Math.sin(t * 14)) * 0.12;
      ctx.beginPath(); ctx.ellipse(0, r * 0.38, r * 0.17, r * open, 0, 0, Math.PI * 2); ctx.fill();
    } else if (pose === 'surprised') {
      ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.1, r * 0.13, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, r * 0.22, r * 0.25, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }

  function flatItems(scene) {
    var out = [];
    (scene.items || []).forEach(function (g) {
      var n = g.shape === 'rainbow' ? 1 : Math.max(1, Math.min(10, g.count || 1));
      for (var k = 0; k < n && out.length < 10; k++) out.push(g);
    });
    return out;
  }

  function drawSubtitle(ctx, W, H, text) {
    ctx.save();
    ctx.font = '700 ' + Math.round(H * 0.045) + 'px "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
    var lines = [], line = '';
    text.split(/\s+/).forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > W * 0.78 && line) { lines.push(line); line = w; } else line = test;
    });
    lines.push(line);
    var lh = H * 0.06, h = lines.length * lh + H * 0.03, y0 = H - h - H * 0.03;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, W * 0.08, y0, W * 0.84, h, 18); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach(function (l, i) { ctx.fillText(l, W / 2, y0 + H * 0.015 + lh * (i + 0.5)); });
    ctx.restore();
  }

  // Draws one frame of a scene at local time lt (seconds into the scene); subtitle is shown when there is no voice.
  function drawScene(ctx, W, H, scene, lt, t, dur, talking, subtitle) {
    drawBg(ctx, W, H, scene.background, t);
    var items = flatItems(scene), n = items.length;
    var step = n ? Math.min(0.9, Math.max(0.25, (dur - 1.6) / n)) : 0;
    var cols = Math.min(5, n), rows = Math.ceil(n / 5);
    var areaX = W * 0.46, areaW = W * 0.5, cy = H * 0.56;
    var s = n ? Math.min(H * 0.1, areaW / (cols * 2.7)) : 0;
    items.forEach(function (it, k) {
      var sc = easeOutBack((lt - 0.4 - k * step) / 0.35);
      if (sc <= 0) return;
      var col = k % 5, row = Math.floor(k / 5);
      var rowN = row === rows - 1 ? n - row * 5 : 5;
      var x = areaX + areaW / 2 + (col - (rowN - 1) / 2) * s * 2.7;
      var y = cy + (row - (rows - 1) / 2) * s * 2.9 + Math.sin(t * 2 + k) * 4;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      if (it.shape === 'rainbow') drawShape(ctx, 'rainbow', 0, 0, H * 0.24, it.color, t, Math.max(0, Math.min(6, it.count || 6)));
      else drawShape(ctx, it.shape, 0, 0, s, it.color || '#e63946', t, 0);
      ctx.restore();
    });
    drawPip(ctx, W * 0.22, H * 0.6, H * 0.17, scene.pip, t, talking);
    if (scene.caption) {
      var cs = easeOutBack((lt - 0.2) / 0.4);
      if (cs > 0) {
        var col1 = (scene.items && scene.items[0] && scene.items[0].color) || '#ff6b6b';
        ctx.save(); ctx.translate(W / 2, H * 0.15); ctx.scale(cs, cs);
        ctx.font = '900 ' + Math.round(H * 0.11) + 'px "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.lineWidth = 14; ctx.strokeStyle = isLight(col1) ? '#3b3b3b' : '#ffffff';
        ctx.strokeText(scene.caption.toUpperCase(), 0, 0);
        ctx.fillStyle = col1; ctx.fillText(scene.caption.toUpperCase(), 0, 0);
        ctx.restore();
      }
    }
    if (subtitle && lt > 0.4) drawSubtitle(ctx, W, H, subtitle);
    if (lt < 0.35) { ctx.fillStyle = 'rgba(255,255,255,' + (1 - lt / 0.35) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  function chime(ac, out, when, pitch) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(880 * pitch, when); o.frequency.exponentialRampToValueAtTime(1320 * pitch, when + 0.12);
    g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(0.25, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    o.connect(g).connect(out); o.start(when); o.stop(when + 0.55);
  }

  // Without a voice, give each line roughly the time a parent needs to read it aloud.
  function readSeconds(text) { return Math.max(2.5, String(text).split(/\s+/).length / 2.2); }

  function sceneTimes(story, bufs) {
    var starts = [], durs = [], t = 0;
    story.scenes.forEach(function (sc, i) {
      var n = flatItems(sc).length;
      var spoken = bufs[i] ? bufs[i].duration : readSeconds(sc.narration);
      var d = Math.max(3, spoken + 1.2, n ? 0.4 + n * 0.75 + 1.2 : 0);
      starts.push(t); durs.push(d); t += d;
    });
    return { starts: starts, durs: durs, total: t };
  }

  // Records the episode in real time to WebM. mp3s[i] is the narration for scene i (ArrayBuffer or null).
  async function renderKidsVideo(story, mp3s, onProgress, mood) {
    var W = 1280, H = 720;
    var ac = new AudioContext(); await ac.resume();
    var bufs = await Promise.all(mp3s.map(function (b) {
      if (!b) return null;
      if (b.pcm) { var buf = ac.createBuffer(1, b.pcm.length, b.rate); buf.copyToChannel(b.pcm, 0); return buf; }
      return ac.decodeAudioData(b.slice(0));
    }));
    var tm = sceneTimes(story, bufs), total = tm.total + 0.4;
    var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var stream = canvas.captureStream(30);
    var dest = ac.createMediaStreamDestination();
    var master = ac.createGain(); master.connect(dest);
    var musicGain = ac.createGain(); musicGain.gain.value = 0.3; musicGain.connect(master);
    stream.addTrack(dest.stream.getAudioTracks()[0]);
    var mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(function (m) { return MediaRecorder.isTypeSupported(m); });
    var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
    var chunks = []; rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };

    drawScene(ctx, W, H, story.scenes[0], 0, 0, tm.durs[0], false);
    rec.start(1000);
    var a0 = ac.currentTime, t0 = performance.now();
    playGeneratedMusic(ac, musicGain, total, mood || 0);
    musicGain.gain.setValueAtTime(0.3, a0 + Math.max(0, total - 2)); musicGain.gain.linearRampToValueAtTime(0, a0 + total);
    story.scenes.forEach(function (sc, i) {
      if (bufs[i]) { var src = ac.createBufferSource(); src.buffer = bufs[i]; src.connect(master); src.start(a0 + tm.starts[i] + 0.4); }
      var n = flatItems(sc).length, step = n ? Math.min(0.9, Math.max(0.25, (tm.durs[i] - 1.6) / n)) : 0;
      for (var k = 0; k < n; k++) chime(ac, master, a0 + tm.starts[i] + 0.4 + k * step, 1 + (k % 5) * 0.12);
    });
    await new Promise(function (resolve) {
      var timer = setInterval(function () {
        var t = (performance.now() - t0) / 1000;
        if (t >= total) { clearInterval(timer); rec.onstop = resolve; rec.stop(); return; }
        var i = 0; while (i < tm.starts.length - 1 && tm.starts[i + 1] <= t) i++;
        var lt = t - tm.starts[i];
        var talking = !!bufs[i] && lt > 0.4 && lt < 0.4 + bufs[i].duration;
        drawScene(ctx, W, H, story.scenes[i], lt, t, tm.durs[i], talking, bufs[i] ? '' : story.scenes[i].narration);
        if (onProgress) onProgress(Math.round(t / total * 100));
      }, 1000 / 30);
    });
    ac.close();
    var cues = story.scenes.map(function (sc, i) {
      var st = tm.starts[i] + 0.4;
      return { start: st, end: st + (bufs[i] ? bufs[i].duration : readSeconds(sc.narration)), text: sc.narration };
    });
    var name = (story.title || 'Little Pip').replace(/[^\w\- ]+/g, '').trim() || 'Little Pip';
    return { file: new File([new Blob(chunks, { type: 'video/webm' })], name + '.webm', { type: 'video/webm' }), cues: cues, seconds: total };
  }

  function drawThumbnail(story) {
    var W = 1280, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    var best = story.scenes.reduce(function (a, b) { return flatItems(b).length > flatItems(a).length ? b : a; }, story.scenes[0]);
    drawBg(ctx, W, H, best.background === 'night' ? 'night' : 'sky', 1);
    var items = flatItems(best).slice(0, 6), s = H * 0.11;
    items.forEach(function (it, k) {
      var x = W * 0.62 + (k % 3 - 1) * s * 2.8, y = H * 0.55 + Math.floor(k / 3) * s * 2.8 - (items.length > 3 ? s * 1.4 : 0);
      if (it.shape === 'rainbow') drawShape(ctx, 'rainbow', W * 0.64, H * 0.55, H * 0.3, it.color, 0, 6);
      else drawShape(ctx, it.shape, x, y, s, it.color, 0, 0);
    });
    drawPip(ctx, W * 0.24, H * 0.62, H * 0.27, 'happy', 0.5, false);
    var text = (story.thumbnailText || story.title || '').toUpperCase();
    ctx.font = '900 ' + Math.round(H * 0.14) + 'px "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 22; ctx.strokeStyle = '#1f2a44'; ctx.strokeText(text, W / 2, H * 0.14);
    ctx.fillStyle = '#ffd43b'; ctx.fillText(text, W / 2, H * 0.14);
    return new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.9); });
  }

  // ---------- Google Text-to-Speech ----------
  async function speak(text, key, voice) {
    var res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ input: { text: text }, voice: { languageCode: voice.slice(0, 5), name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.88 } })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error('Voice: ' + ((data.error && data.error.message) || res.statusText));
    var bin = atob(data.audioContent), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // ---------- ElevenLabs (Pip's character voice) ----------
  async function speakEleven(text, key, voiceId) {
    var res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key, Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: text, model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } })
    });
    if (!res.ok) {
      var d = (await res.json().catch(function () { return {}; })).detail;
      throw new Error('ElevenLabs: ' + ((d && (d.message || d.status)) || (typeof d === 'string' ? d : '') || res.statusText));
    }
    return res.arrayBuffer();
  }
  async function loadElevenVoices() {
    var key = $('kdElKey').value.trim();
    if (!key) return toast('Paste your ElevenLabs API key first', true);
    try {
      var res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error((data.detail && data.detail.message) || res.statusText);
      var list = data.voices || [];
      if (!list.length) throw new Error('no voices in your account yet — add one from the Voice Library');
      $('kdElVoice').innerHTML = list.map(function (v) {
        var l = v.labels || {};
        return '<option value="' + esc(v.voice_id) + '">' + esc(v.name + (l.age ? ' · ' + l.age : '') + (l.gender ? ' · ' + l.gender : '')) + '</option>';
      }).join('');
      toast('Loaded ' + list.length + ' voices — pick Pip\'s voice');
    } catch (e) { toast('ElevenLabs: ' + e.message, true); }
  }

  // ---------- Free voice: Kokoro (open-source, Apache-2.0) running in the browser ----------
  function loadKokoro() {
    if (!kokoroLoading) kokoroLoading = import(KOKORO_URL)
      .then(function (m) { return m.KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'wasm' }); })
      .catch(function (e) { kokoroLoading = null; throw new Error('Free voice failed to load: ' + e.message); });
    return kokoroLoading;
  }
  // Returns raw samples; pitch > 1 plays them faster and higher so Pip sounds younger.
  async function speakFree(text, voice, pitch) {
    var tts = await loadKokoro();
    var audio = await tts.generate(text, { voice: voice });
    return { pcm: audio.audio, rate: audio.sampling_rate * pitch };
  }

  // ---------- YouTube extras ----------
  function srtTime(sec) {
    var ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    var p = function (n, l) { return String(n).padStart(l, '0'); };
    return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + ',' + p(ms % 1000, 3);
  }
  async function uploadCaptions(videoId, cues) {
    var srt = cues.map(function (c, i) { return (i + 1) + '\n' + srtTime(c.start) + ' --> ' + srtTime(c.end) + '\n' + c.text + '\n'; }).join('\n');
    var b = 'pip' + Math.random().toString(36).slice(2);
    var body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify({ snippet: { videoId: videoId, language: 'en', name: 'English' } })
      + '\r\n--' + b + '\r\nContent-Type: application/octet-stream\r\n\r\n' + srt + '\r\n--' + b + '--';
    var res = await fetch('https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + b }, body: body });
    if (!res.ok) throw new Error(((await res.json().catch(function () { return {}; })).error || {}).message || res.statusText);
  }
  async function setThumbnail(videoId, blob) {
    var res = await fetch('https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=' + videoId + '&uploadType=media', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'image/jpeg' }, body: blob });
    if (!res.ok) throw new Error(((await res.json().catch(function () { return {}; })).error || {}).message || res.statusText);
  }
  async function addToPlaylist(videoId) {
    var list = await api('/playlists?part=snippet&mine=true&maxResults=50');
    var pl = (list.items || []).find(function (p) { return p.snippet.title === PLAYLIST_NAME; });
    if (!pl) pl = await api('/playlists?part=snippet,status', { method: 'POST', body: {
      snippet: { title: PLAYLIST_NAME, description: 'Learn colors, shapes and numbers with Little Pip.' },
      status: { privacyStatus: 'private' } } });
    await api('/playlistItems?part=snippet', { method: 'POST', body: {
      snippet: { playlistId: pl.id, resourceId: { kind: 'youtube#video', videoId: videoId } } } });
  }

  function cleanStory(story) {
    story.scenes = (story.scenes || []).slice(0, 16).map(function (s) {
      return {
        narration: String(s.narration || '').trim(),
        background: BGS.indexOf(s.background) >= 0 ? s.background : 'sky',
        pip: POSES.indexOf(s.pip) >= 0 ? s.pip : 'happy',
        caption: String(s.caption || '').slice(0, 14),
        items: (s.items || []).slice(0, 2).filter(function (it) { return SHAPES.indexOf(it.shape) >= 0; })
      };
    }).filter(function (s) { return s.narration; });
    if (!story.scenes.length) throw new Error('AI returned an empty episode');
    return story;
  }

  // ---------- UI ----------
  function setup() {
    var nav = document.querySelector('#app nav');
    if (!nav) return;
    var btn = document.createElement('button'); btn.textContent = 'Kids 🧸'; btn.dataset.tab = 'kids';
    nav.insertBefore(btn, nav.querySelector('[data-tab="create"]'));
    var sec = document.createElement('section'); sec.id = 'tab-kids'; sec.className = 'hidden';
    sec.innerHTML =
      '<div class="card"><h3 style="margin-top:0">Little Pip studio</h3>'
      + '<p class="muted" style="margin:0">Makes animated, narrated learning episodes for ages 2–5 with captions, a thumbnail and a playlist, '
      + 'uploaded as <b>Private</b> and <b>Made for Kids</b>. Keep this tab open and on screen while it works.</p>'
      + '<div class="grid2">'
      + '<div><label for="kdClaude">Claude API key</label><input id="kdClaude" type="password" autocomplete="off" placeholder="sk-ant-…" style="width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px"></div>'
      + '<div><label for="kdTts">Google voice API key (optional — empty = music + on-screen text)</label><input id="kdTts" type="password" autocomplete="off" placeholder="AIza…" style="width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px"></div>'
      + '<div><label for="kdFreeVoice">Free voice for Pip (no key; first use downloads about 90 MB)</label><select id="kdFreeVoice">'
      + '<option value="af_heart">Heart (warm, US)</option><option value="af_bella">Bella (bright, US)</option>'
      + '<option value="af_sky">Sky (light, US)</option><option value="bf_emma">Emma (gentle, UK)</option>'
      + '<option value="none">No voice (music + on-screen text)</option></select></div>'
      + '<div><label for="kdPitch">Pip voice style</label><select id="kdPitch">'
      + '<option value="1">Normal</option><option value="1.12" selected>Younger</option><option value="1.22">Cartoon kid</option></select></div>'
      + '<div><label for="kdElKey">ElevenLabs API key (Pip\'s kid voice — used first if set)</label><input id="kdElKey" type="password" autocomplete="off" placeholder="sk_…" style="width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px"></div>'
      + '<div><label for="kdElVoice">ElevenLabs voice for Pip</label><div style="display:flex;gap:6px"><select id="kdElVoice" style="flex:1"><option value="">(load your voices)</option></select>'
      + '<button type="button" class="secondary" id="kdElLoad">Load my voices</button></div></div>'
      + '<div><label for="kdVoice">Google voice (if no ElevenLabs key)</label><select id="kdVoice">'
      + '<option value="en-US-Neural2-F">Warm female (US)</option><option value="en-US-Neural2-H">Bright female (US)</option>'
      + '<option value="en-US-Neural2-D">Friendly male (US)</option><option value="en-GB-Neural2-A">Gentle female (UK)</option></select></div>'
      + '<div><label for="kdCount">If the list is empty, AI picks this many episodes</label><input id="kdCount" type="number" min="1" max="10" value="3"></div>'
      + '</div>'
      + '<label style="font-weight:400"><input id="kdRemember" type="checkbox"> Remember both keys on this computer</label>'
      + '<label for="kdTopics">Episodes to make (one per line — leave empty and AI chooses)</label>'
      + '<textarea id="kdTopics"></textarea>'
      + '<label style="font-weight:400"><input id="kdReview" type="checkbox" checked> Let me watch and approve each episode before it\'s uploaded</label>'
      + '<div class="actions"><button id="kdRun">Start</button><button id="kdStop" class="secondary">Stop after current episode</button></div></div>'
      + '<div id="kdLog"></div>';
    $('app').appendChild(sec);
    $('kdTopics').value = PLANNED.join('\n');
    try {
      var ck = localStorage.getItem(KEY_STORE), tk = localStorage.getItem(TTS_STORE);
      if (ck) $('kdClaude').value = ck;
      if (tk) { $('kdTts').value = tk; $('kdRemember').checked = true; }
      var ek = localStorage.getItem(EL_STORE), ev = localStorage.getItem(EL_VOICE_STORE);
      if (ek) { $('kdElKey').value = ek; $('kdRemember').checked = true; }
      if (ev) $('kdElVoice').innerHTML = '<option value="' + esc(ev) + '">Saved voice</option>';
      var fv = localStorage.getItem(FREE_VOICE_STORE), pv = localStorage.getItem(PITCH_STORE);
      if (fv) $('kdFreeVoice').value = fv;
      if (pv) $('kdPitch').value = pv;
    } catch (e) {}
    $('kdElLoad').onclick = loadElevenVoices;

    btn.onclick = function () {
      document.querySelectorAll('nav button').forEach(function (x) { x.classList.toggle('active', x === btn); });
      document.querySelectorAll('#app > section').forEach(function (s) { s.classList.toggle('hidden', s !== sec); });
    };
    nav.querySelectorAll('button').forEach(function (b) {
      if (b !== btn) b.addEventListener('click', function () { sec.classList.add('hidden'); });
    });
    $('kdStop').onclick = function () { stopping = true; toast('Will stop after the current episode'); };
    $('kdRun').onclick = run;
  }

  var stopping = false;

  function review(box, file, thumbUrl, story) {
    return new Promise(function (resolve) {
      var opts = (story.titleOptions || []).concat([story.title]).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
      box.innerHTML = '<img src="' + thumbUrl + '" alt="Thumbnail" style="width:100%;max-width:420px;border-radius:8px;margin-top:10px;display:block">'
        + '<video controls playsinline src="' + URL.createObjectURL(file) + '" style="width:100%;max-height:420px;background:#000;border-radius:8px;margin-top:10px"></video>'
        + '<label>Title</label><select class="rv-t">' + opts.map(function (o) {
          return '<option' + (o === story.title ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'
        + '<label>Description</label><textarea class="rv-d">' + esc(story.description) + '</textarea>'
        + '<div class="actions"><button class="rv-ok">Approve &amp; upload</button><button class="secondary rv-skip">Skip</button></div>';
      box.querySelector('.rv-ok').onclick = function () {
        var r = { ok: true, title: box.querySelector('.rv-t').value, description: box.querySelector('.rv-d').value };
        box.innerHTML = ''; resolve(r);
      };
      box.querySelector('.rv-skip').onclick = function () { box.innerHTML = ''; resolve({ ok: false }); };
    });
  }

  async function run() {
    var key = $('kdClaude').value.trim(), ttsKey = $('kdTts').value.trim(), voice = $('kdVoice').value;
    var elKey = $('kdElKey').value.trim(), elVoice = $('kdElVoice').value;
    var freeVoice = $('kdFreeVoice').value, pitch = Number($('kdPitch').value) || 1;
    try { localStorage.setItem(FREE_VOICE_STORE, freeVoice); localStorage.setItem(PITCH_STORE, String(pitch)); } catch (e) {}
    if (!key) return toast('Paste your Claude API key first', true);
    if (elKey && !elVoice) return toast('Click "Load my voices" and pick Pip\'s voice', true);
    try {
      if ($('kdRemember').checked) {
        localStorage.setItem(KEY_STORE, key); localStorage.setItem(TTS_STORE, ttsKey);
        localStorage.setItem(EL_STORE, elKey); localStorage.setItem(EL_VOICE_STORE, elVoice);
      } else [TTS_STORE, EL_STORE, EL_VOICE_STORE].forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
    var topics = $('kdTopics').value.split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
    stopping = false; $('kdRun').disabled = true;

    if (!topics.length) {
      $('kdLog').insertAdjacentHTML('afterbegin', '<div class="card muted">Choosing episodes…</div>');
      var note = $('kdLog').firstElementChild;
      try {
        var count = Math.min(10, Math.max(1, Number($('kdCount').value) || 3));
        var past = Object.values(videos).map(function (v) { return v.snippet.title; }).slice(0, 40);
        var r = await askClaude(key, KIDS_TOPICS_SYSTEM, TOPICS_SCHEMA,
          'Past episode titles (do not repeat): ' + (past.join(' | ') || '(none)') + '\nNumber of topics: ' + count);
        topics = r.topics.map(function (t) { return t.trim(); }).filter(Boolean).slice(0, count);
        if (!topics.length) throw new Error('AI returned no topics');
        note.textContent = 'AI chose: ' + topics.join(' · ');
      } catch (e) { note.textContent = '❌ ' + e.message; $('kdRun').disabled = false; return; }
    }

    for (var i = 0; i < topics.length; i++) {
      if (stopping) break;
      var topic = topics[i];
      $('kdLog').insertAdjacentHTML('afterbegin', '<div class="card"><b>' + esc(topic) + '</b><div class="muted kd-st"></div><div class="kd-rv"></div></div>');
      var card = $('kdLog').firstElementChild, st = card.querySelector('.kd-st');
      try {
        st.textContent = 'Writing the episode…';
        var story = cleanStory(await askClaude(key, KIDS_SYSTEM, STORY_SCHEMA, 'Episode topic: ' + topic));
        var mp3s = [];
        for (var k = 0; k < story.scenes.length; k++) {
          var line = story.scenes[k].narration;
          if (elKey) mp3s.push(await speakEleven(line, elKey, elVoice));
          else if (ttsKey) mp3s.push(await speak(line, ttsKey, voice));
          else if (freeVoice !== 'none') {
            if (k === 0 && !kokoroLoading) st.textContent = 'Loading the free voice (first time can take a few minutes)…';
            await loadKokoro();
            st.textContent = 'Recording Pip\'s voice… ' + (k + 1) + '/' + story.scenes.length;
            mp3s.push(await speakFree(line, freeVoice, pitch));
            continue;
          } else { mp3s.push(null); continue; }
          st.textContent = 'Recording Pip\'s voice… ' + (k + 1) + '/' + story.scenes.length;
        }
        var out = await renderKidsVideo(story, mp3s, function (p) { st.textContent = 'Animating… ' + p + '% (keep this tab on screen)'; }, i);
        var thumb = await drawThumbnail(story);
        var title = story.title, description = story.description;
        if ($('kdReview').checked) {
          st.textContent = 'Waiting for your approval';
          var rv = await review(card.querySelector('.kd-rv'), out.file, URL.createObjectURL(thumb), story);
          if (!rv.ok) { st.textContent = 'Skipped'; continue; }
          title = rv.title; description = rv.description;
        }
        var meta = {
          snippet: { title: title.slice(0, 100), description: description, tags: (story.tags || []).slice(0, 15),
            categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
          status: { privacyStatus: 'private', selfDeclaredMadeForKids: true }
        };
        var result = await uploadVideo(out.file, meta, function (p) { st.textContent = 'Uploading… ' + p + '%'; });
        var notes = [];
        st.textContent = 'Adding thumbnail, captions and playlist…';
        try { await setThumbnail(result.id, thumb); notes.push('thumbnail ✓'); } catch (e) { notes.push('thumbnail ✗ (' + e.message + ')'); }
        try { await uploadCaptions(result.id, out.cues); notes.push('captions ✓'); } catch (e) { notes.push('captions ✗ (' + e.message + ')'); }
        try { await addToPlaylist(result.id); notes.push('playlist ✓'); } catch (e) { notes.push('playlist ✗ (' + e.message + ')'); }
        st.innerHTML = '✅ Uploaded (Private, Made for Kids) — <a href="https://youtu.be/' + result.id + '" target="_blank" rel="noopener">open video</a> · '
          + esc(notes.join(' · '));
      } catch (e) { st.textContent = '❌ ' + e.message; }
    }
    $('kdRun').disabled = false;
    toast(stopping ? 'Stopped' : 'All episodes finished');
    loadVideos(true);
  }

  window.Pip = { renderKidsVideo: renderKidsVideo, drawThumbnail: drawThumbnail, drawScene: drawScene };
  setup();
})();
