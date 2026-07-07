// ═══ CONFIGURATION ═══
const API = "http://127.0.0.1:5000/api";

// ═══ STATE ═══
let currentUser        = null;
let examTimer          = null;
let examSeconds        = 0;
let currentQuestion    = 0;
let selectedAnswers    = {};
let tabSwitchCount     = 0;
let selectedBookingSlot = null;
let selectedLecturerName = '';
let selectedLecturerId  = null;
let selectedSlotId      = null;
let currentCourseDetailCode = null;
let currentCourseDetailId   = null;
let currentExamAttemptId    = null;
let currentExamId           = null;
let currentExamQuestions    = [];
let allCourses              = [];
let pendingLecturerFile     = null;
let pendingSubmitFile       = null;
let pendingSubmitAssignmentId = null;
let pendingSubmitTitle      = null;

// ═══ API HELPER ═══
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    method: opts.method || 'GET',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ═══ UTILITIES ═══
function scoreToGrade(pct) {
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 45) return 'D';
  return 'F';
}

function gradeBadgeClass(grade) {
  if (grade === 'A' || grade === 'A+') return 'badge-green';
  if (grade === 'B' || grade === 'B+') return 'badge-blue';
  if (grade === 'C')                   return 'badge-amber';
  return 'badge-red';
}

function courseColor(index) {
  const colors = ['#4b5563','#1d6fa4','#d97706','#c0392b','#7c3aed','#0f766e','#9333ea','#0891b2'];
  return colors[index % colors.length];
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ═══ AUTH ═══
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('Please enter your email and password.'); return; }
  try {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    currentUser = {
      user_id:  data.user_id,
      name:     data.full_name,
      email:    data.email,
      role:     data.role,
      initials: data.full_name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(),
    };
    showToast('✅ Login successful');
    launchApp();
  } catch (err) {
    showToast(`❌ ${err.message}`);
  }
}

async function doRegister() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const matric   = document.getElementById('reg-matric').value.trim();
  const role     = document.getElementById('reg-role').value;
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !matric || !password) { showToast('Please fill in all fields.'); return; }
  const body = { full_name: name, email, password, role };
  if (role === 'student') { body.matric_number = matric; body.level = '100L'; }
  else                    { body.staff_number  = matric; }
  try {
    await api('/auth/register', { method: 'POST', body });
    showToast('✅ Account created! Please sign in.');
    switchAuthTab('login');
  } catch (err) {
    showToast(`❌ ${err.message}`);
  }
}

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
  currentUser = null; allCourses = [];
  clearInterval(examTimer);
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('topbar').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  showToast('👋 Logged out successfully.');
}

function launchApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('topbar').classList.remove('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('role-badge').textContent  = currentUser.role.toUpperCase();
  document.getElementById('user-avatar').textContent = currentUser.initials || 'US';
  document.getElementById('notif-dot').style.display = 'block';
  const role = currentUser.role;
  document.getElementById('nav-student').classList.toggle('hidden', role !== 'student');
  document.getElementById('nav-lecturer').classList.toggle('hidden', role !== 'lecturer');
  document.getElementById('nav-admin').classList.toggle('hidden', role !== 'admin');
  if (role === 'student') {
    document.getElementById('student-name-display').textContent = (currentUser.name || 'User').split(' ')[0];
    loadStudentDashboard(); showPage('s-dashboard');
  } else if (role === 'lecturer') {
    loadLecturerDashboard(); showPage('l-dashboard');
  } else {
    loadAdminDashboard(); showPage('a-dashboard');
  }
}

// ═══ NAVIGATION ═══
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const page = document.getElementById(id);
  if (page) page.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + id + "'")) n.classList.add('active');
  });
  if (id === 'l-results')       loadPublishResults();
  if (id === 'l-effectiveness') loadEffectiveness();
  if (id === 's-results')       loadStudentResults();
  if (id === 's-adaptive')      renderAdaptiveQuiz();
  if (id === 's-exam-taking')   clearInterval(examTimer);
  if (id === 's-assignments')   loadStudentAssignments();
  if (id === 'l-assignments')   loadLecturerAssignments();
  if (id === 's-booking')       loadBookingPage();
  if (id === 's-courses')       loadStudentCourses();
  if (id === 'l-courses')       loadLecturerCourses();
  if (id === 'l-exams')         loadLecturerExams();
  if (id === 's-exams')         loadStudentExams();
  if (id === 'notifications')   loadNotifications();
  if (id === 'a-users')         loadAdminUsers();
  if (id === 'l-upload')        { if (allCourses.length) populateCourseSelects(allCourses); }
  if (id === 'l-office-hours')  { loadAvailabilityTable(); loadLecturerBookings(); }
}

// ═══ STUDENT DASHBOARD ═══
async function loadStudentDashboard() {
  try {
    const [courses, assignments, exams, notifications] = await Promise.all([
      api('/courses'), api('/assignments'), api('/exams'), api('/notifications'),
    ]);
    allCourses = courses;
    populateCourseSelects(courses);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('s-stat-courses', courses.length);
    set('s-stat-pending', assignments.filter(a => a.status === 'Pending').length);
    set('s-stat-exams',   exams.filter(e => e.status === 'Open' || e.status === 'Scheduled').length);
    set('s-stat-notifs',  notifications.filter(n => !n.is_read).length);
    const grid = document.getElementById('s-dashboard-recent-courses');
    if (grid) renderCourseCards(grid, courses.slice(0, 3), 'student');
  } catch (err) { showToast('Failed to load dashboard: ' + err.message); }
}

// ═══ LECTURER DASHBOARD ═══
async function loadLecturerDashboard() {
  try {
    const [courses, assignments, exams] = await Promise.all([
      api('/courses'), api('/assignments'), api('/exams'),
    ]);
    allCourses = courses;
    populateCourseSelects(courses);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('l-stat-courses',     courses.length);
    set('l-stat-students',    courses.reduce((s, c) => s + (c.student_count || 0), 0));
    set('l-stat-assignments', assignments.length);
    set('l-stat-exams',       exams.length);
    const el = document.getElementById('l-dashboard-courses');
    if (el) el.innerHTML = courses.map(c => `
      <div class="course-card-mini">
        <strong>${c.course_code}</strong> — ${c.title}
        <span class="badge badge-gray" style="float:right;">${c.student_count || 0} students</span>
      </div>`).join('') || '<p style="color:var(--text-3);">No courses yet.</p>';
  } catch (err) { showToast('Failed to load dashboard: ' + err.message); }
}

// ═══ COURSE HELPERS ═══
function populateCourseSelects(courses) {
  ['upload-course-select','new-assign-course','new-exam-course','publish-course-select','effectiveness-course-select'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = courses.map(c => `<option value="${c.course_id}">${c.title} (${c.course_code})</option>`).join('');
  });
}

function renderCourseCards(container, courses, role) {
  container.innerHTML = courses.map((c, i) => `
    <div class="course-card" onclick="${role === 'student' ? `showCourseDetail('${c.course_id}','${c.course_code}')` : `showToast('Opening ${c.title}...')`}">
      <div class="course-card-banner" style="background:${courseColor(i)};"></div>
      <div class="course-card-body">
        <div class="course-card-code">${c.course_code}</div>
        <div class="course-card-title">${c.title}</div>
        <div class="course-card-meta">
          <span>${role === 'student' ? '👨‍🏫 ' + (c.lecturer_name || '') : '👥 ' + (c.student_count || 0) + ' students'}</span>
          <span class="badge badge-gray">${c.level}</span>
        </div>
        ${role === 'student' ? `
          <div class="course-card-progress">
            <div class="progress-bar"><div class="progress-fill" style="width:${c.progress_pct || 0}%;background:${courseColor(i)};"></div></div>
            <div class="progress-label">${c.progress_pct || 0}% complete</div>
          </div>` : `
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button class="btn btn-green btn-sm" onclick="event.stopPropagation();showPage('l-upload')">Upload</button>
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();showPage('l-effectiveness')">Analytics</button>
          </div>`}
      </div>
    </div>`).join('');
}

// ═══ COURSES PAGES ═══
async function loadStudentCourses() {
  const grid = document.getElementById('student-courses-grid');
  grid.innerHTML = '<p style="color:var(--text-3);padding:20px;">Loading...</p>';
  try {
    const courses = await api('/courses');
    allCourses = courses; populateCourseSelects(courses);
    const browseBtn = `
      <div class="course-card" onclick="openBrowseCourses()"
        style="display:flex;align-items:center;justify-content:center;min-height:160px;border:2px dashed var(--border);box-shadow:none;cursor:pointer;">
        <div style="text-align:center;color:var(--text-3);">
          <div style="font-size:28px;margin-bottom:6px;">🔍</div>
          <div style="font-size:13px;font-weight:600;">Browse &amp; Enroll</div>
        </div>
      </div>`;
    if (!courses.length) {
      grid.innerHTML = '<p style="color:var(--text-3);padding:0 0 12px;">No courses enrolled yet.</p>';
      grid.innerHTML += browseBtn;
      return;
    }
    renderCourseCards(grid, courses, 'student');
    grid.innerHTML += browseBtn;
  } catch (err) { grid.innerHTML = `<p style="color:var(--red);padding:20px;">${err.message}</p>`; }
}

// ═══ BROWSE & SELF-ENROLL ═══
async function openBrowseCourses() {
  showModal('browse-courses-modal');
  const list = document.getElementById('browse-courses-list');
  list.innerHTML = '<p style="color:var(--text-3);padding:12px;">Loading available courses...</p>';
  try {
    const courses = await api('/courses/available');
    if (!courses.length) {
      list.innerHTML = '<p style="color:var(--text-3);padding:12px;">You are enrolled in every available course. 🎉</p>';
      return;
    }
    list.innerHTML = courses.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;background:#fff;">
        <div>
          <div style="font-weight:600;font-size:14px;">${c.course_code} — ${c.title}</div>
          <div style="font-size:12px;color:var(--text-3);">${c.level} · ${c.credit_units} units · ${c.lecturer_name||'Staff'}</div>
        </div>
        <button class="btn btn-green btn-sm" id="enroll-btn-${c.course_id}" onclick="enrollInCourse('${c.course_id}','${c.course_code}')">Enroll</button>
      </div>`).join('');
  } catch (err) { list.innerHTML = `<p style="color:var(--red);padding:12px;">${err.message}</p>`; }
}

async function enrollInCourse(courseId, courseCode) {
  const btn = document.getElementById(`enroll-btn-${courseId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Enrolling...'; }
  try {
    await api('/enroll', { method: 'POST', body: { course_id: courseId } });
    showToast(`✅ Enrolled in ${courseCode}`);
    openBrowseCourses();   // refresh the available list
    loadStudentCourses();  // refresh the enrolled grid behind the modal
  } catch (err) {
    showToast(`❌ ${err.message}`);
    if (btn) { btn.disabled = false; btn.textContent = 'Enroll'; }
  }
}

async function loadLecturerCourses() {
  const grid = document.getElementById('lecturer-courses-grid');
  grid.innerHTML = '<p style="color:var(--text-3);padding:20px;">Loading...</p>';
  try {
    const courses = await api('/courses');
    allCourses = courses; populateCourseSelects(courses);
    renderCourseCards(grid, courses, 'lecturer');
    grid.innerHTML += `
      <div class="course-card" onclick="showModal('lecturer-add-course-modal')"
        style="display:flex;align-items:center;justify-content:center;min-height:160px;border:2px dashed var(--border);box-shadow:none;">
        <div style="text-align:center;color:var(--text-3);">
          <div style="font-size:28px;margin-bottom:6px;">➕</div>
          <div style="font-size:13px;font-weight:600;">Add New Course</div>
        </div>
      </div>`;
  } catch (err) { grid.innerHTML = `<p style="color:var(--red);padding:20px;">${err.message}</p>`; }
}

async function addLecturerCourse() {
  const code  = document.getElementById('new-course-code').value.trim().toUpperCase();
  const title = document.getElementById('new-course-title').value.trim();
  const level = document.getElementById('new-course-level').value;
  const units = document.getElementById('new-course-units').value || 3;
  if (!code || !title) { showToast('Please fill in the course code and title.'); return; }
  try {
    await api('/courses', { method: 'POST', body: { course_code: code, title, level, credit_units: Number(units) } });
    closeAllModals(); showToast(`✅ Course created: ${code} — ${title}`);
    document.getElementById('new-course-code').value = '';
    document.getElementById('new-course-title').value = '';
    document.getElementById('new-course-units').value = '3';
    loadLecturerCourses();
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ COURSE DETAIL ═══
function showCourseDetail(courseId, courseCode) {
  currentCourseDetailId = courseId; currentCourseDetailCode = courseCode;
  renderCourseDetailTab('materials'); showPage('s-course-detail');
}

function switchCourseDetailTab(tab) { renderCourseDetailTab(tab); }

async function renderCourseDetailTab(tab) {
  const courseId = currentCourseDetailId;
  const course   = allCourses.find(c => c.course_id === courseId) ||
                   { course_code: currentCourseDetailCode, title: '', level: '', lecturer_name: '', student_count: 0 };
  const idx   = allCourses.findIndex(c => c.course_id === courseId);
  const color = courseColor(idx >= 0 ? idx : 0);

  const tabsHtml = `
    <div class="tabs">
      <div class="tab ${tab==='materials'  ?'active':''}" onclick="switchCourseDetailTab('materials')">Materials</div>
      <div class="tab ${tab==='assignments'?'active':''}" onclick="switchCourseDetailTab('assignments')">Assignments</div>
      <div class="tab ${tab==='discussions'?'active':''}" onclick="switchCourseDetailTab('discussions')">Discussions</div>
    </div>`;

  const header = `
    <div style="border-radius:var(--radius-lg);overflow:hidden;margin-bottom:20px;">
      <div style="background:${color};padding:24px;color:#fff;">
        <div style="font-size:12px;opacity:0.8;">${course.course_code} · ${course.level}</div>
        <h2 style="font-size:22px;font-weight:700;margin:4px 0;">${course.title}</h2>
        <div style="font-size:13px;opacity:0.85;">👨‍🏫 ${course.lecturer_name||''} · 👥 ${course.student_count||0} enrolled</div>
      </div>
    </div>`;

  const container = document.getElementById('course-detail-content');
  container.innerHTML = header + tabsHtml + '<p style="color:var(--text-3);padding:20px;">Loading...</p>';
  let bodyHtml = '';
  try {
    if (tab === 'materials') {
      const materials = await api(`/courses/${courseId}/materials`);
      bodyHtml = `
        <div class="panel">
          <div class="panel-title">📁 Course Materials</div>
          <table>
            <thead><tr><th>Title</th><th>Type</th><th>Uploaded</th><th>Action</th></tr></thead>
            <tbody>${materials.length ? materials.map(m => `
              <tr>
                <td>${m.title}</td>
                <td><span class="badge ${m.material_type==='Video'?'badge-red':'badge-blue'}">${m.material_type}</span></td>
                <td>${formatDate(m.uploaded_at)}</td>
                <td>${m.material_type==='Video'
                  ? `<button class="btn btn-green btn-sm" onclick="window.open('${m.youtube_url}','_blank')">Watch</button>`
                  : `<button class="btn btn-green btn-sm" onclick="markMaterialComplete('${m.material_id}');downloadMaterial('${m.title.replace(/'/g,"\\'")}')">Download</button>`}</td>
              </tr>`).join('')
              : `<tr><td colspan="4" style="text-align:center;color:var(--text-3);">No materials yet.</td></tr>`}
            </tbody>
          </table>
        </div>`;

    } else if (tab === 'assignments') {
      const assignments = await api('/assignments');
      const mine = assignments.filter(a => a.course_id === courseId || a.course_title === course.title);
      bodyHtml = `
        <div class="panel">
          <div class="panel-title">📝 Assignments — ${course.title}</div>
          <table>
            <thead><tr><th>Assignment</th><th>Due</th><th>Status</th><th>Score</th><th>Action</th></tr></thead>
            <tbody>${mine.length ? mine.map(a => `
              <tr>
                <td>${a.title}</td>
                <td>${formatDate(a.due_date)}</td>
                <td><span class="badge ${a.status==='Graded'?'badge-green':a.status==='Submitted'?'badge-blue':'badge-gray'}">${a.status}</span></td>
                <td>${a.score!=null?a.score+'/'+a.max_score:'—'}</td>
                <td>${a.status==='Pending'
                  ? `<button class="btn btn-green btn-sm" onclick="showSubmitModal('${a.title.replace(/'/g,"\\'")}','${a.assignment_id}')">Submit</button>`
                  : '—'}</td>
              </tr>`).join('')
              : `<tr><td colspan="5" style="text-align:center;color:var(--text-3);">No assignments yet.</td></tr>`}
            </tbody>
          </table>
        </div>`;

    } else if (tab === 'discussions') {
      const posts = await api(`/courses/${courseId}/discussions`);
      bodyHtml = `
        <div class="panel">
          <div class="panel-title">💬 Discussion Board — ${course.title}</div>
          <div id="discussion-posts" style="margin-bottom:16px;">
            ${posts.length ? posts.map(d => `
              <div style="padding:12px 0;border-bottom:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <strong style="font-size:13px;">${d.author_name}
                    ${d.author_role==='lecturer'?'<span class="badge badge-green" style="margin-left:6px">Lecturer</span>':''}
                  </strong>
                  <span style="font-size:11px;color:var(--text-3);">${formatDate(d.posted_at)}</span>
                </div>
                <p style="font-size:13px;color:var(--text-2);">${d.content}</p>
              </div>`).join('')
              : `<p style="text-align:center;color:var(--text-3);font-size:13px;">No posts yet. Be the first!</p>`}
          </div>
          <textarea class="textarea-field" id="new-discussion-text" placeholder="Post a question or comment..." style="min-height:70px;"></textarea>
          <button class="btn btn-green btn-sm" style="margin-top:10px;" onclick="postDiscussion()">Post</button>
        </div>`;
    }
  } catch (err) {
    bodyHtml = `<p style="color:var(--red);padding:20px;">Failed to load: ${err.message}</p>`;
  }
  container.innerHTML = header + tabsHtml + bodyHtml;
}

async function postDiscussion() {
  const text = document.getElementById('new-discussion-text').value.trim();
  if (!text) { showToast('Write something before posting.'); return; }
  try {
    await api(`/courses/${currentCourseDetailId}/discussions`, { method: 'POST', body: { content: text } });
    showToast('💬 Posted.'); renderCourseDetailTab('discussions');
  } catch (err) { showToast(`❌ ${err.message}`); }
}

async function markMaterialComplete(materialId) {
  try { await api(`/materials/${materialId}/complete`, { method: 'POST' }); } catch (e) {}
}

// ═══ MATERIAL UPLOAD ═══
function toggleUploadYoutubeField() {
  const isVideo = document.getElementById('upload-type-select').value === 'Video';
  document.getElementById('upload-youtube-row').classList.toggle('hidden', !isVideo);
  document.getElementById('upload-file-area').classList.toggle('hidden', isVideo);
}

function handleLecturerFile(input) {
  if (!input.files || !input.files[0]) return;
  pendingLecturerFile = input.files[0];
  document.getElementById('lecturer-upload-text').textContent = '📄 ' + pendingLecturerFile.name;
}

async function uploadCourseMaterial() {
  const courseId    = document.getElementById('upload-course-select').value;
  const type        = document.getElementById('upload-type-select').value;
  const title       = document.getElementById('upload-title-input').value.trim();
  const youtubeLink = document.getElementById('upload-youtube-input').value.trim();
  const desc        = document.getElementById('upload-desc-input')?.value.trim() || '';
  if (!title)                           { showToast('Please give this material a title.'); return; }
  if (type==='Video' && !youtubeLink)   { showToast('Please paste a YouTube link.'); return; }
  if (type!=='Video' && !pendingLecturerFile) { showToast('Please attach a file.'); return; }
  try {
    await api(`/courses/${courseId}/materials`, { method: 'POST', body: {
      title, material_type: type, description: desc,
      youtube_url: type==='Video' ? youtubeLink : null,
      file_url:    type!=='Video' ? (pendingLecturerFile?.name || null) : null,
    }});
    showToast('✅ Material uploaded: ' + title);
    document.getElementById('upload-title-input').value   = '';
    document.getElementById('upload-youtube-input').value = '';
    if (document.getElementById('upload-desc-input')) document.getElementById('upload-desc-input').value = '';
    document.getElementById('lecturer-upload-text').textContent = 'Click to upload or drag & drop';
    pendingLecturerFile = null;
    document.getElementById('file-input').value = '';
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ OFFICE HOURS — LECTURER ═══
async function addOfficeHourSlot() {
  const day      = document.getElementById('new-slot-day').value;
  const location = document.getElementById('new-slot-location').value.trim() || 'CS Block';
  const start    = document.getElementById('new-slot-start').value;
  const end      = document.getElementById('new-slot-end').value;
  if (!start || !end) { showToast('Please set a start and end time.'); return; }
  try {
    await api('/office-hours/slots', { method: 'POST', body: { day_of_week: day, start_time: start, end_time: end, location } });
    await loadAvailabilityTable(); closeAllModals();
    showToast(`✅ Slot added: ${day} ${start}–${end}`);
    document.getElementById('new-slot-location').value = '';
  } catch (err) { showToast(`❌ ${err.message}`); }
}

async function loadAvailabilityTable() {
  try {
    const slots = await api(`/office-hours/slots?lecturer_id=${currentUser.user_id}`);
    const tbody = document.getElementById('availability-table');
    if (!tbody) return;
    tbody.innerHTML = slots.map(s => `
      <tr>
        <td>${s.day_of_week}</td>
        <td>${s.start_time}–${s.end_time} · ${s.location||'CS Block'}</td>
        <td><span class="badge badge-green">Open</span></td>
      </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-3);">No slots yet.</td></tr>';
  } catch (e) {}
}

async function loadLecturerBookings() {
  const tbody = document.getElementById('lecturer-bookings-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td style="color:var(--text-3);">Loading bookings...</td></tr>';
  try {
    const bookings = await api('/office-hours/bookings');
    if (!bookings.length) {
      tbody.innerHTML = '<tr><td style="color:var(--text-3);">No upcoming bookings.</td></tr>';
      return;
    }
    const badge = { confirmed:'badge-green', pending:'badge-amber', cancelled:'badge-gray' };
    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td><strong>${b.student_name || 'Student'}</strong>
          <br><span style="font-size:11px;color:var(--text-3);">${b.reason || 'Office hours'}</span></td>
        <td style="text-align:right;">
          <span class="badge ${badge[b.status] || 'badge-green'}">${b.day_of_week || ''} ${(b.start_time||'').slice(0,5)}</span>
          <br><span style="font-size:11px;color:var(--text-3);">${b.booking_date || ''}</span></td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td style="color:var(--red);">${err.message}</td></tr>`;
  }
}

// ═══ ASSIGNMENTS — STUDENT ═══
async function loadStudentAssignments() {
  const tbody = document.getElementById('student-assignments-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-3);">Loading...</td></tr>';
  try {
    const assignments = await api('/assignments');
    tbody.innerHTML = assignments.map(a => `
      <tr id="assign-row-${a.assignment_id}">
        <td><strong>${a.title}</strong></td>
        <td>${a.course_title}</td>
        <td>${formatDate(a.due_date)}</td>
        <td class="assign-status"><span class="badge ${a.status==='Graded'?'badge-green':a.status==='Submitted'?'badge-blue':'badge-gray'}">${a.status}</span></td>
        <td class="assign-action">
          ${a.status==='Pending'
            ? `<button class="btn btn-green btn-sm" onclick="showSubmitModal('${a.title.replace(/'/g,"\\'")}','${a.assignment_id}')">Submit</button>`
            : a.status==='Graded' ? `<span style="font-size:12px;color:var(--text-3);">${a.score}/${a.max_score}</span>`
            : '<span style="font-size:12px;color:var(--text-3);">Submitted</span>'}
        </td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-3);">No assignments yet.</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red);text-align:center;">${err.message}</td></tr>`; }
}

// ═══ ASSIGNMENTS — LECTURER ═══
async function loadLecturerAssignments() {
  const tbody = document.getElementById('lecturer-assignments-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-3);">Loading...</td></tr>';
  try {
    const assignments = await api('/assignments');
    tbody.innerHTML = assignments.map(a => `
      <tr>
        <td><strong>${a.title}</strong></td>
        <td>${a.course_title}</td>
        <td>${formatDate(a.due_date)}</td>
        <td><span class="badge ${Number(a.graded_count)===Number(a.submission_count)&&Number(a.submission_count)>0?'badge-green':Number(a.submission_count)>0?'badge-amber':'badge-gray'}">
          ${a.graded_count||0}/${a.submission_count||0} graded
        </span></td>
        <td><button class="btn btn-green btn-sm" onclick="openGradeAssignment('${a.assignment_id}','${a.title.replace(/'/g,"\\'")}','${a.course_title.replace(/'/g,"\\'")}')">Grade</button></td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-3);">No assignments yet.</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red);text-align:center;">${err.message}</td></tr>`; }
}

async function createAssignment() {
  const courseId     = document.getElementById('new-assign-course').value;
  const title        = document.getElementById('new-assign-title').value.trim();
  const due          = document.getElementById('new-assign-due').value;
  const score        = document.getElementById('new-assign-score').value || 100;
  const instructions = document.getElementById('new-assign-instructions')?.value.trim() || '';
  if (!title) { showToast('Please give the assignment a title.'); return; }
  if (!due)   { showToast('Please pick a due date.'); return; }
  try {
    await api('/assignments', { method: 'POST', body: { course_id: courseId, title, due_date: due, max_score: Number(score), instructions } });
    closeAllModals(); showToast(`✅ Assignment created: ${title}`);
    document.getElementById('new-assign-title').value = '';
    document.getElementById('new-assign-due').value   = '';
    document.getElementById('new-assign-score').value = '100';
    if (document.getElementById('new-assign-instructions')) document.getElementById('new-assign-instructions').value = '';
    loadLecturerAssignments();
  } catch (err) { showToast(`❌ ${err.message}`); }
}

async function openGradeAssignment(assignmentId, title, course) {
  document.getElementById('grade-assignment-content').innerHTML = '<p style="padding:20px;color:var(--text-3);">Loading submissions...</p>';
  showPage('l-grade-assignment');
  try {
    const records = await api(`/assignments/${assignmentId}/submissions`);
    document.getElementById('grade-assignment-content').innerHTML = `
      <div class="page-header"><h2>📝 Grade: ${title}</h2><p>${course} · ${records.length} submission${records.length===1?'':'s'}</p></div>
      <div class="panel">
        <table>
          <thead><tr><th>Student</th><th>Matric No</th><th>Status</th><th>Score /100</th><th>Grade</th><th>Action</th></tr></thead>
          <tbody>
            ${records.map(r => {
              const grade = r.score!=null ? scoreToGrade(r.score) : '—';
              return `<tr>
                <td>${r.student_name}</td><td>${r.matric_number}</td>
                <td><span class="badge ${r.status==='Graded'?'badge-green':'badge-blue'}">${r.status}</span></td>
                <td><input type="number" id="grade-input-${r.submission_id}" value="${r.score!=null?r.score:''}" min="0" max="100" placeholder="—"
                  style="width:64px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;text-align:center;"/> / 100</td>
                <td id="grade-badge-${r.submission_id}"><span class="badge ${grade!=='—'?gradeBadgeClass(grade):'badge-gray'}">${grade}</span></td>
                <td><button class="btn btn-green btn-sm" onclick="saveSubmissionGrade('${r.submission_id}')">Save</button></td>
              </tr>`;
            }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">No submissions yet.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } catch (err) { document.getElementById('grade-assignment-content').innerHTML = `<p style="color:var(--red);padding:20px;">${err.message}</p>`; }
}

async function saveSubmissionGrade(submissionId) {
  const score = Number(document.getElementById('grade-input-' + submissionId).value);
  if (isNaN(score) || score < 0 || score > 100) { showToast('Score must be 0–100.'); return; }
  try {
    await api(`/submissions/${submissionId}/grade`, { method: 'POST', body: { score } });
    const grade = scoreToGrade(score);
    document.getElementById('grade-badge-' + submissionId).innerHTML = `<span class="badge ${gradeBadgeClass(grade)}">${grade}</span>`;
    showToast('✅ Grade saved');
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ SUBMIT ASSIGNMENT (STUDENT) ═══
function showSubmitModal(name, assignmentId) {
  document.getElementById('submit-assignment-name').textContent = name;
  pendingSubmitAssignmentId = assignmentId; pendingSubmitFile = null; pendingSubmitTitle = name;
  document.getElementById('assignment-file-input').value        = '';
  document.getElementById('assignment-upload-text').textContent = 'Click to attach your file';
  document.getElementById('assignment-submit-notes').value      = '';
  showModal('submit-assignment-modal');
}

function handleAssignmentFile(input) {
  if (!input.files || !input.files[0]) return;
  pendingSubmitFile = input.files[0];
  document.getElementById('assignment-upload-text').textContent = '📄 ' + pendingSubmitFile.name;
}

async function submitAssignmentFile() {
  if (!pendingSubmitFile) { showToast('Please attach a file before submitting.'); return; }
  const notes = document.getElementById('assignment-submit-notes')?.value.trim() || '';
  try {
    await api(`/assignments/${pendingSubmitAssignmentId}/submit`, { method: 'POST', body: { file_url: pendingSubmitFile.name, notes } });
    const row = document.getElementById('assign-row-' + pendingSubmitAssignmentId);
    if (row) {
      row.querySelector('.assign-status').innerHTML = '<span class="badge badge-blue">Submitted</span>';
      row.querySelector('.assign-action').innerHTML = `<span style="font-size:12px;color:var(--text-3)">${pendingSubmitFile.name}</span>`;
    }
    showToast('✅ Submitted: ' + pendingSubmitFile.name); closeAllModals();
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ EXAMS — STUDENT ═══
async function loadStudentExams() {
  const tbody = document.getElementById('student-upcoming-exams-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">Loading...</td></tr>';
  try {
    const exams = await api('/exams');
    tbody.innerHTML = exams.map(e => `
      <tr>
        <td><strong>${e.title}</strong></td><td>${e.course_title}</td>
        <td>${formatDate(e.scheduled_at)}</td><td>${e.duration_mins} mins</td>
        <td><span class="badge ${e.status==='Open'?'badge-green':e.status==='Graded'?'badge-blue':'badge-gray'}">${e.status}</span></td>
        <td>${e.status==='Open'
          ? `<button class="btn btn-green btn-sm" onclick="startExam('${e.exam_id}',${e.duration_mins})">Start Exam</button>`
          : e.status==='Graded' ? `<span style="font-size:12px;">Score: ${e.raw_score!=null?e.raw_score+'%':'—'}</span>`
          : '<span style="font-size:12px;color:var(--text-3);">Not open yet</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">No exams scheduled.</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);text-align:center;">${err.message}</td></tr>`; }
}

// ═══ EXAMS — LECTURER ═══
async function loadLecturerExams() {
  const tbody = document.getElementById('lecturer-exams-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">Loading...</td></tr>';
  try {
    const exams = await api('/exams');
    tbody.innerHTML = exams.map(e => `
      <tr>
        <td><strong>${e.title}</strong></td><td>${e.course_title}</td>
        <td>${formatDate(e.scheduled_at)}</td>
        <td>${e.total_attempts||0} attempts ${e.flagged_count>0?`<span class="badge badge-red">${e.flagged_count} flagged</span>`:''}</td>
        <td><span class="badge ${e.is_open?'badge-green':'badge-gray'}">${e.is_open?'Open':'Closed'}</span></td>
        <td>
  <button class="btn btn-green btn-sm" onclick="openExamQuestions('${e.exam_id}')">Questions</button>
  <button class="btn btn-outline btn-sm" onclick="toggleExamOpen('${e.exam_id}',${e.is_open})">${e.is_open?'Close':'Open'}</button>
</td>
<td>
   <button class="btn btn-blue btn-sm" onclick="openExamGrading('${e.exam_id}','${e.course_id||''}')">Grade / Results</button>
  <button class="btn btn-outline btn-sm" onclick="toggleExamOpen('${e.exam_id}',${e.is_open})">${e.is_open?'Close':'Open'}</button>
</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">No exams yet.</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);text-align:center;">${err.message}</td></tr>`; }
}

async function createExam() {
  const courseId = document.getElementById('new-exam-course').value;
  const title    = document.getElementById('new-exam-title').value.trim();
  const date     = document.getElementById('new-exam-date').value;
  const duration = document.getElementById('new-exam-duration').value || 60;
  if (!title) { showToast('Please give the exam a title.'); return; }
  if (!date)  { showToast('Please pick an exam date.'); return; }
  try {
    await api('/exams', { method: 'POST', body: { course_id: courseId, title, scheduled_at: date + 'T00:00:00', duration_mins: Number(duration) } });
    closeAllModals(); showToast(`✅ Exam created: ${title}`);
    document.getElementById('new-exam-title').value    = '';
    document.getElementById('new-exam-date').value     = '';
    document.getElementById('new-exam-duration').value = '60';
    loadLecturerExams();
  } catch (err) { showToast(`❌ ${err.message}`); }
}
let currentExamIdForQuestions = null;
 

async function openExamQuestions(examId) {
  currentExamIdForQuestions = examId;
  document.getElementById('new-question-text').value = '';
  document.getElementById('new-question-marks').value = '1';
  document.getElementById('new-question-type').value = 'MCQ';
  document.getElementById('new-question-options').innerHTML = '';
  addOptionRow(); addOptionRow();         
  toggleQuestionOptions();
  showModal('exam-questions-modal');
  await loadExistingQuestions();
}
 


async function loadExistingQuestions() {
  const box = document.getElementById('exam-questions-existing');
  box.innerHTML = '<p style="color:var(--text-3);">Loading questions...</p>';
  try {
    const qs = await api(`/exams/${currentExamIdForQuestions}/manage-questions`);
    if (!qs.length) { box.innerHTML = '<p style="color:var(--text-3);">No questions yet. Add the first one below.</p>'; return; }
    box.innerHTML = qs.map((q, i) => `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div style="font-size:13px;font-weight:600;">Q${i + 1}. ${q.question_text}</div>
          <button class="btn btn-outline btn-sm" onclick="deleteQuestion('${q.question_id}')">Delete</button>
        </div>
        <div style="font-size:11px;color:var(--text-3);margin:4px 0;">${q.question_type} · ${q.marks} mark(s)</div>
        ${(q.options || []).map(o => `
          <div style="font-size:12px;color:${o.is_correct ? 'var(--green,#15803d)' : 'var(--text-2)'};">
            ${o.is_correct ? '✓' : '○'} ${o.text}
          </div>`).join('')}
      </div>`).join('');
  } catch (err) { box.innerHTML = `<p style="color:var(--red);">${err.message}</p>`; }
}
 
function toggleQuestionOptions() {
  const isMCQ = document.getElementById('new-question-type').value === 'MCQ';
  document.getElementById('new-question-options-row').style.display = isMCQ ? 'block' : 'none';
}
 
function addOptionRow() {
  const wrap = document.getElementById('new-question-options');
  const idx = wrap.children.length;
  const row = document.createElement('div');
  row.style = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
  row.innerHTML = `
    <input type="radio" name="correct-option" value="${idx}" ${idx === 0 ? 'checked' : ''}/>
    <input class="input-field opt-text" style="flex:1;" placeholder="Option ${idx + 1}"/>
    <button class="btn btn-outline btn-sm" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(row);
}
 
async function saveExamQuestion() {
  const text  = document.getElementById('new-question-text').value.trim();
  const type  = document.getElementById('new-question-type').value;
  const marks = Number(document.getElementById('new-question-marks').value) || 1;
  if (!text) { showToast('Enter the question text.'); return; }
 
  let options = [];
  if (type === 'MCQ') {
    const rows = [...document.querySelectorAll('#new-question-options > div')];
    const chosen = document.querySelector('input[name="correct-option"]:checked');
    const chosenIdx = chosen ? Number(chosen.value) : -1;
    options = rows.map((r, i) => ({
      option_text: r.querySelector('.opt-text').value.trim(),
      is_correct: i === chosenIdx,
    })).filter(o => o.option_text);
    if (options.length < 2) { showToast('Add at least two options.'); return; }
    if (!options.some(o => o.is_correct)) { showToast('Select the correct option.'); return; }
  }
 
  try {
    await api(`/exams/${currentExamIdForQuestions}/questions`, {
      method: 'POST',
      body: { question_text: text, question_type: type, marks, options },
    });
    showToast('✅ Question added');
    // reset form for the next question
    document.getElementById('new-question-text').value = '';
    document.getElementById('new-question-options').innerHTML = '';
    addOptionRow(); addOptionRow();
    await loadExistingQuestions();
  } catch (err) { showToast(`❌ ${err.message}`); }
}
 
async function deleteQuestion(questionId) {
  try {
    await api(`/questions/${questionId}`, { method: 'DELETE' });
    showToast('Question deleted');
    await loadExistingQuestions();
  } catch (err) { showToast(`❌ ${err.message}`); }
}
async function toggleExamOpen(examId, currentlyOpen) {
  try {
    const result = await api(`/exams/${examId}/toggle`, { method: 'POST' });
    showToast(result.is_open ? '🔓 Exam opened.' : '🔒 Exam closed.'); loadLecturerExams();
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ EXAM ENGINE ═══
async function startExam(examId, durationMins) {
  currentExamId = examId; currentExamAttemptId = null;
  currentExamQuestions = []; currentQuestion = 0; selectedAnswers = {}; tabSwitchCount = 0;
  examSeconds = (durationMins || 45) * 60;
  try {
    const attempt   = await api(`/exams/${examId}/attempt`, { method: 'POST' });
    currentExamAttemptId = attempt.attempt_id;
    const questions = await api(`/exams/${examId}/questions`);
    currentExamQuestions = questions;
    showPage('s-exam-taking'); renderQuestion(); updateExamDots(); startExamTimer(); setupTabDetection();
  } catch (err) { showToast(`❌ ${err.message}`); }
}

function renderQuestion() {
  const q = currentExamQuestions[currentQuestion];
  if (!q) return;
  const shuffled = shuffleArray([...q.options]);
  document.getElementById('exam-q-num').textContent   = currentQuestion + 1;
  document.getElementById('exam-q-total').textContent = currentExamQuestions.length;
  document.getElementById('exam-question-container').innerHTML = `
    <div class="question-card">
      <div class="question-number">Question ${currentQuestion+1} of ${currentExamQuestions.length}</div>
      <div class="question-text">${q.question_text}</div>
      ${shuffled.map(o => `
        <div class="option-item ${selectedAnswers[currentQuestion]===o.option_id?'selected':''}" onclick="selectAnswer('${o.option_id}')">
          <div class="option-radio"></div><span style="font-size:14px;">${o.text}</span>
        </div>`).join('')}
    </div>
    <div style="text-align:right;margin-top:-10px;margin-bottom:20px;">
      ${currentQuestion===currentExamQuestions.length-1?`<button class="btn btn-green" onclick="submitExam()">Submit Exam ✓</button>`:''}
    </div>`;
  document.getElementById('exam-prev-btn').disabled = currentQuestion === 0;
  document.getElementById('exam-next-btn').style.display = currentQuestion===currentExamQuestions.length-1?'none':'flex';
}

function selectAnswer(optionId) { selectedAnswers[currentQuestion] = optionId; renderQuestion(); updateExamDots(); }

function examNav(dir) {
  currentQuestion = Math.max(0, Math.min(currentExamQuestions.length-1, currentQuestion+dir));
  renderQuestion(); updateExamDots();
}

function updateExamDots() {
  document.getElementById('exam-nav-dots').innerHTML = currentExamQuestions.map((_,i) => `
    <div onclick="currentQuestion=${i};renderQuestion();updateExamDots()"
      style="width:10px;height:10px;border-radius:50%;cursor:pointer;transition:all 0.2s;
             background:${i===currentQuestion?'#fff':selectedAnswers[i]!==undefined?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.2)'};
             border:2px solid rgba(255,255,255,0.6);"></div>`).join('');
}

function startExamTimer() {
  clearInterval(examTimer);
  examTimer = setInterval(() => {
    examSeconds--;
    const m=Math.floor(examSeconds/60), s=examSeconds%60;
    const el = document.getElementById('exam-timer');
    if (el) { el.textContent=`${m}:${s.toString().padStart(2,'0')}`; el.className='exam-timer'+(examSeconds<300?' warning':'')+(examSeconds<60?' danger':''); }
    if (examSeconds<=0) { clearInterval(examTimer); submitExam(); }
  }, 1000);
}

function setupTabDetection() {
  document.removeEventListener('visibilitychange', handleTabSwitch);
  document.addEventListener('visibilitychange', handleTabSwitch);
}

async function handleTabSwitch() {
  const examPage = document.getElementById('s-exam-taking');
  if (document.hidden && examPage && !examPage.classList.contains('hidden') && currentExamAttemptId) {
    tabSwitchCount++;
    const banner = document.getElementById('exam-flag-banner');
    if (banner) { banner.style.display='flex'; banner.textContent=`⚠️ Warning ${tabSwitchCount}: Tab switching detected!`; }
    showToast(`⚠️ Tab switch detected! (${tabSwitchCount})`);
    try { await api(`/attempts/${currentExamAttemptId}/flag`, { method: 'POST', body: { event_type: 'tab_switch' } }); } catch (e) {}
  }
}

async function submitExam() {
  clearInterval(examTimer);
  document.removeEventListener('visibilitychange', handleTabSwitch);
  const answers = Object.entries(selectedAnswers).map(([qi, optionId]) => ({
    question_id: currentExamQuestions[Number(qi)].question_id, chosen_option: optionId,
  }));
  try {
    const result = await api(`/attempts/${currentExamAttemptId}/submit`, { method: 'POST', body: { answers } });
    const pct=result.raw_score, grade=scoreToGrade(pct);
    document.getElementById('s-exam-taking').innerHTML = `
      <div class="result-header"><div class="grade-circle">${grade}</div><h2 style="margin:0;font-size:20px;">Exam Submitted</h2></div>
      <div class="result-body">
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card" style="--accent:var(--brand)"><div class="stat-label">Score</div><div class="stat-val">${pct}%</div></div>
          <div class="stat-card" style="--accent:var(--blue)"><div class="stat-label">Grade</div><div class="stat-val">${grade}</div></div>
          <div class="stat-card" style="--accent:${tabSwitchCount>0?'var(--red)':'var(--brand)'}"><div class="stat-label">Flags</div><div class="stat-val">${tabSwitchCount}</div></div>
        </div>
        ${tabSwitchCount>0?'<div class="alert alert-warning">⚠️ Your attempt was flagged for tab switching.</div>':'<div class="alert alert-success">✅ Clean attempt — no integrity flags raised.</div>'}
        <button class="btn btn-green" onclick="showPage('s-exams')">← Back to Exams</button>
      </div>`;
  } catch (err) { showToast(`❌ Failed to submit: ${err.message}`); }
}

// ═══ RESULTS — LECTURER ═══
async function loadPublishResults() {
  const courseId = document.getElementById('publish-course-select')?.value;
  if (!courseId) return;
  const tbody = document.getElementById('publish-results-table');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">Loading...</td></tr>';
  try {
    const results = await api('/results');
    const courseResults = results.filter(r => r.course_id === courseId);
    tbody.innerHTML = courseResults.map(r => {
      const grade = r.grade || scoreToGrade(r.final_score||0);
      return `<tr>
        <td>${r.student_name}</td><td>${r.matric_number||'—'}</td>
        <td>${r.ca_average!=null?Math.round(r.ca_average)+'%':'—'}</td>
        <td>${r.exam_score!=null?Math.round(r.exam_score)+'%':'—'}</td>
        <td><strong>${r.final_score!=null?Math.round(r.final_score)+'%':'—'}</strong></td>
        <td><span class="badge ${gradeBadgeClass(grade)}">${grade}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">No graded records yet.</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);text-align:center;">${err.message}</td></tr>`; }
}

async function publishCourseResults() {
  const courseId  = document.getElementById('publish-course-select')?.value;
  const weighting = document.getElementById('publish-weight-select')?.value || '30-70';
  const [caWeight, examWeight] = weighting.split('-').map(Number);
  if (!courseId) { showToast('Please select a course.'); return; }
  try {
    const semesters = await api('/semesters');
    const current   = semesters.find(s => s.is_current) || semesters[0];
    if (!current) { showToast('No semester configured. Ask your admin.'); return; }
    const result = await api('/results/publish', { method: 'POST',
      body: { course_id: courseId, semester_id: current.semester_id, ca_weight: caWeight, exam_weight: examWeight } });
    showToast(`✅ ${result.message}`); loadPublishResults();
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ PER-EXAM GRADING + TAB-SWITCH (INTEGRITY) VIEW ═══
let gradingExamId = null;

async function openExamGrading(examId, courseId) {
  gradingExamId = examId;
  showModal('exam-grading-modal');
  await Promise.all([loadAttemptsForGrading(), loadIntegrityForExam()]);
}

async function loadAttemptsForGrading() {
  const box = document.getElementById('grading-attempts');
  if (!box) return;
  box.innerHTML = '<p style="color:var(--text-3);">Loading attempts...</p>';
  try {
    const rows = await api(`/exams/${gradingExamId}/attempts`);
    if (!rows.length) { box.innerHTML = '<p style="color:var(--text-3);">No student has attempted this exam yet.</p>'; return; }
    box.innerHTML = `
      <table class="data-table" style="width:100%;font-size:13px;">
        <thead><tr><th>Student</th><th>Matric</th><th>Auto Score</th><th>Tab Switches</th><th>Final Score</th><th></th></tr></thead>
        <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.student_name}</td>
            <td>${r.matric_number || ''}</td>
            <td>${r.raw_score != null ? r.raw_score + '%' : '—'}</td>
            <td>${r.tab_switch_count > 0 ? `<span class="badge badge-red">${r.tab_switch_count}</span>` : '<span class="badge badge-green">0</span>'}</td>
            <td><input type="number" min="0" max="100" class="input-field" style="width:80px;" id="grade-input-${r.attempt_id}" value="${r.final_score != null ? r.final_score : (r.raw_score != null ? r.raw_score : '')}"/></td>
            <td><button class="btn btn-green btn-sm" onclick="saveExamGrade('${r.attempt_id}')">Save</button></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) { box.innerHTML = `<p style="color:var(--red);">${err.message}</p>`; }
}

async function saveExamGrade(attemptId) {
  const val = document.getElementById(`grade-input-${attemptId}`).value;
  if (val === '') { showToast('Enter a score.'); return; }
  try {
    await api(`/exams/${gradingExamId}/grade/${attemptId}`, { method: 'POST', body: { final_score: Number(val) } });
    showToast('✅ Grade saved. Publish results to make it visible to the student.');
  } catch (err) { showToast(`❌ ${err.message}`); }
}

async function loadIntegrityForExam() {
  const box = document.getElementById('grading-integrity');
  if (!box) return;
  box.innerHTML = '<p style="color:var(--text-3);">Loading integrity log...</p>';
  try {
    const rows = await api(`/exams/${gradingExamId}/integrity`);
    if (!rows.length) { box.innerHTML = '<p style="color:var(--text-3);">No tab-switch or integrity events recorded.</p>'; return; }
    box.innerHTML = `
      <table class="data-table" style="width:100%;font-size:13px;">
        <thead><tr><th>Student</th><th>Matric</th><th>Event</th><th>When</th></tr></thead>
        <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.student_name}</td>
            <td>${r.matric_number || ''}</td>
            <td><span class="badge badge-red">${r.event_type}</span></td>
            <td>${typeof formatDate === 'function' ? formatDate(r.event_at) : r.event_at}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) { box.innerHTML = `<p style="color:var(--red);">${err.message}</p>`; }
}

// ═══ RESULTS — STUDENT ═══
async function loadStudentResults() {
  const tbody = document.getElementById('student-results-table');
  if (!tbody) return;
  tbody.querySelectorAll('tr[data-live-result]').forEach(r => r.remove());
  try {
    const results = await api('/results');
    results.forEach(r => {
      const grade = r.grade || scoreToGrade(r.final_score||0);
      const row   = document.createElement('tr');
      row.dataset.liveResult = 'true';
      row.innerHTML = `
        <td><strong>${r.course_title||r.course_code}</strong> <span class="badge badge-blue" style="margin-left:6px;">Published</span></td>
        <td>${r.ca_average!=null?Math.round(r.ca_average)+'%':'—'}</td>
        <td>${r.exam_score!=null?Math.round(r.exam_score)+'%':'—'}</td>
        <td><strong>${r.final_score!=null?Math.round(r.final_score)+'%':'—'}</strong></td>
        <td><span class="badge ${gradeBadgeClass(grade)}">${grade}</span></td>`;
      tbody.prepend(row);
    });
  } catch (err) { showToast('Failed to load results: ' + err.message); }
}

// ═══ BOOKING — STUDENT ═══
async function loadBookingPage() {
  // Load lecturers and bookings independently so one failing doesn't blank the other.
  try {
    const lecturers = await api('/lecturers');
    const list = document.getElementById('booking-lecturers-list');
    if (list) {
      list.innerHTML = lecturers.map(l => `
        <div class="booking-lecturer-card" onclick="selectLecturer('${l.lecturer_id}','${l.full_name.replace(/'/g,"\\'")}')">
          <div style="font-weight:700;">${l.full_name}</div>
          <div style="font-size:12px;color:var(--text-3);">${l.office_location||'CS Block'}</div>
        </div>`).join('') || '<p style="color:var(--text-3);">No lecturers available.</p>';
    }
  } catch (err) {
    const list = document.getElementById('booking-lecturers-list');
    if (list) list.innerHTML = `<p style="color:var(--red);">Could not load lecturers: ${err.message}</p>`;
  }

  try {
    const bookings = await api('/office-hours/bookings');
    const tbody = document.getElementById('my-bookings-table');
    if (tbody) renderBookingsTable(tbody, bookings);
  } catch (err) {
    const tbody = document.getElementById('my-bookings-table');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--red);">Could not load bookings: ${err.message}</td></tr>`;
  }
}

function renderBookingsTable(tbody, bookings) {
  tbody.innerHTML = bookings.map(b => `
    <tr>
      <td><strong>${b.lecturer_name}</strong></td><td>${b.course_title||'—'}</td>
      <td>${formatDate(b.booking_date)} ${b.start_time?'— '+b.start_time:''}</td>
      <td>${b.location||'CS Block'}</td>
      <td><span class="badge ${b.status==='cancelled'?'badge-red':'badge-green'}">${b.status||'Confirmed'}</span></td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-3);">No bookings yet.</td></tr>';
}

async function selectLecturer(lecturerId, name) {
  selectedLecturerName=name; selectedLecturerId=lecturerId; selectedBookingSlot=null; selectedSlotId=null;
  document.getElementById('booking-lecturer-name').textContent = name;
  document.getElementById('booking-slots-section').classList.remove('hidden');
  document.getElementById('booking-confirm-section').classList.add('hidden');
  document.getElementById('booking-note-section').classList.remove('hidden');
  await loadSlots(lecturerId);
}

async function loadSlots(lecturerId) {
  selectedBookingSlot = null;
  const grid = document.getElementById('booking-slots');
  grid.innerHTML = '<p style="color:var(--text-3);">Loading slots...</p>';
  try {
    const slots = await api(`/office-hours/slots?lecturer_id=${lecturerId}`);
    grid.innerHTML = slots.map(s => `
      <div class="slot available" onclick="selectSlot(this,'${s.slot_id}','${s.start_time}')">
        ${s.day_of_week} ${s.start_time}–${s.end_time}<br>
        <span style="font-size:10px;">${s.location||'CS Block'}</span>
      </div>`).join('') || '<p style="color:var(--text-3);">No open slots for this lecturer.</p>';
  } catch (err) { grid.innerHTML = `<p style="color:var(--red);">${err.message}</p>`; }
}

function selectSlot(el, slotId, time) {
  selectedBookingSlot=time; selectedSlotId=slotId;
  document.querySelectorAll('#booking-slots .slot.available').forEach(s => s.classList.remove('booked'));
  el.classList.add('booked');
}

function resetBookingForm() {
  // hide the confirmation, bring back the reason box + Confirm button
  document.getElementById('booking-confirm-section').classList.add('hidden');
  document.getElementById('booking-note-section').classList.remove('hidden');
  const note = document.getElementById('booking-note');
  if (note) note.value = '';
  // clear any selected slot highlight
  document.querySelectorAll('#booking-slots .slot').forEach(s => s.classList.remove('booked'));
  selectedBookingSlot = null; selectedSlotId = null;
}

async function confirmBooking() {
  if (!selectedSlotId) { showToast('Please select a time slot first.'); return; }
  const dateEl = document.getElementById('booking-date-select');
  const bookingDate = dateEl.value;
  const reason = document.getElementById('booking-note')?.value.trim() || '';
  if (!bookingDate) { showToast('Please select a date.'); return; }
  try {
    await api('/office-hours/book', { method: 'POST', body: { slot_id: selectedSlotId, booking_date: bookingDate, reason } });
    document.getElementById('booking-confirm-text').textContent =
      `Your session with ${selectedLecturerName} on ${bookingDate} at ${selectedBookingSlot} is confirmed.`;
    document.getElementById('booking-confirm-section').classList.remove('hidden');
    document.getElementById('booking-note-section').classList.add('hidden');
    if (document.getElementById('booking-note')) document.getElementById('booking-note').value = '';
    selectedBookingSlot=null; selectedSlotId=null;
    showToast('📅 Booking confirmed!');
    const bookings = await api('/office-hours/bookings');
    const tbody = document.getElementById('my-bookings-table');
    if (tbody) renderBookingsTable(tbody, bookings);
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ EFFECTIVENESS ═══
async function loadEffectiveness() {
  const courseId = document.getElementById('effectiveness-course-select')?.value;
  if (!courseId) return;
  try {
    const data = await api(`/analytics/effectiveness?course_id=${courseId}`);
    renderEffectivenessFromData(data);
  } catch (err) { showToast('Failed to load effectiveness data: ' + err.message); }
}

function renderEffectivenessFromData(data) {
  if (!data || !data.topics) return;
  const { topics, students, class_avg, at_risk_count } = data;
  const mastered=topics.filter(t=>t.avg>=75).length, struggling=topics.filter(t=>t.avg<50).length;

  document.getElementById('effectiveness-stats-grid').innerHTML = `
    <div class="stat-card" style="--accent:var(--brand)"><div class="stat-label">Class Average</div><div class="stat-val">${class_avg}%</div><div class="stat-sub">All assignments</div></div>
    <div class="stat-card" style="--accent:var(--brand)"><div class="stat-label">Topics Mastered</div><div class="stat-val">${mastered}</div><div class="stat-sub">&gt;75% avg</div></div>
    <div class="stat-card" style="--accent:var(--red)"><div class="stat-label">Topics Struggling</div><div class="stat-val">${struggling}</div><div class="stat-sub">&lt;50% avg</div></div>
    <div class="stat-card" style="--accent:var(--amber)"><div class="stat-label">At-Risk Students</div><div class="stat-val">${at_risk_count}</div><div class="stat-sub">Below 50% overall</div></div>`;

  document.getElementById('effectiveness-bars').innerHTML = topics.map(t => {
    const color = t.avg>=75?'var(--brand)':t.avg>=50?'var(--amber)':'var(--red)';
    return `<div class="topic-bar-row"><span class="topic-name">${t.name}</span><div class="topic-bar-wrap"><div class="topic-bar-fill" style="width:${t.avg}%;background:${color};"></div></div><span class="topic-pct" style="color:${color};">${t.avg}%</span></div>`;
  }).join('');

  const strongTopics=topics.filter(t=>t.avg>=75), weakTopics=topics.filter(t=>t.avg<50);
  document.getElementById('effectiveness-strong-weak-grid').innerHTML = `
    <div class="eff-card strong">
      <div class="eff-label">✅ Strong (avg &gt;75%)</div>
      ${strongTopics.length?strongTopics.map(t=>`<div class="eff-topic"><span>${t.name}</span><strong style="color:var(--brand);">${t.avg}%</strong></div>`).join(''):'<p style="font-size:13px;color:var(--text-3);">None above 75% yet.</p>'}
    </div>
    <div class="eff-card weak">
      <div class="eff-label">❌ Weak (avg &lt;50%)</div>
      ${weakTopics.length?weakTopics.map(t=>`<div class="eff-topic"><span>${t.name}</span><strong style="color:var(--red);">${t.avg}%</strong></div>`).join(''):'<p style="font-size:13px;color:var(--text-3);">No weak topics.</p>'}
    </div>`;

  if (topics.length) {
    const weakest = topics.reduce((min,t)=>t.avg<min.avg?t:min, topics[0]);
    document.getElementById('effectiveness-recommendation-panel').innerHTML = `
      <div class="panel-title">🤖 Recommendation</div>
      <div style="background:#fff8dc;border-radius:var(--radius);padding:16px;border-left:4px solid var(--amber);">
        <p style="font-size:14px;font-weight:600;color:#92400e;">Action: ${weakest.name} (${weakest.avg}% avg)</p>
        <p style="font-size:13px;color:var(--text-2);margin-top:6px;">${weakest.student_count_below50||0} students below 50%. Consider revisiting this material.</p>
        <button class="btn btn-amber btn-sm" style="margin-top:10px;" onclick="showToast('Office hours slot opened!')">Open Targeted Office Hours</button>
      </div>`;
  }

  document.getElementById('eff-score-header').innerHTML =
    `<th style="text-align:left;padding:6px 10px;">Student</th>` +
    topics.map(t=>`<th style="text-align:center;padding:6px;white-space:nowrap;">${t.name}</th>`).join('');
  document.getElementById('eff-score-body').innerHTML = students.map(s => `
    <tr>
      <td style="padding:5px 10px;white-space:nowrap;">${s.name}</td>
      ${s.scores.map(sc=>`<td style="text-align:center;padding:4px;font-size:13px;">${sc!=null?sc+'%':'—'}</td>`).join('')}
    </tr>`).join('');
}

// ═══ NOTIFICATIONS ═══
async function loadNotifications() {
  const container = document.getElementById('notifications-list');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-3);padding:20px;">Loading...</p>';
  try {
    const notifs = await api('/notifications');
    container.innerHTML = notifs.map(n => `
      <div style="padding:12px;border-bottom:1px solid var(--border);background:${n.is_read?'#fff':'#f0f9ff'};cursor:pointer;"
        onclick="markNotifRead('${n.notification_id}',this)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <strong style="font-size:13px;">${n.title}</strong>
          <span style="font-size:11px;color:var(--text-3);">${formatDate(n.created_at)}</span>
        </div>
        <p style="font-size:13px;color:var(--text-2);">${n.body}</p>
      </div>`).join('') || '<p style="text-align:center;color:var(--text-3);padding:20px;">No notifications.</p>';
  } catch (err) { container.innerHTML = `<p style="color:var(--red);padding:20px;">${err.message}</p>`; }
}

async function markNotifRead(notifId, el) {
  try { await api(`/notifications/${notifId}/read`, { method: 'POST' }); el.style.background='#fff'; } catch (e) {}
}

// ═══ ADMIN ═══
async function loadAdminDashboard() {
  try {
    const [users, courses] = await Promise.all([api('/admin/users'), api('/courses')]);
    const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
    set('a-stat-students',  users.filter(u=>u.role==='student').length);
    set('a-stat-lecturers', users.filter(u=>u.role==='lecturer').length);
    set('a-stat-courses',   courses.length);
  } catch (err) { showToast('Failed to load admin dashboard: ' + err.message); }
}

async function loadAdminUsers() {
  const tbody = document.getElementById('admin-users-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">Loading...</td></tr>';
  try {
    const users = await api('/admin/users');
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.full_name}</td><td>${u.email}</td>
        <td><span class="badge ${u.role==='student'?'badge-blue':u.role==='lecturer'?'badge-green':'badge-red'}">${u.role}</span></td>
        <td>${u.id_number||'—'}</td>
        <td><span class="badge ${u.is_active?'badge-green':'badge-gray'}">${u.is_active?'Active':'Inactive'}</span></td>
        <td><button class="btn ${u.is_active?'btn-outline':'btn-green'} btn-sm" onclick="toggleUser('${u.user_id}',this)">${u.is_active?'Deactivate':'Activate'}</button></td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">No users found.</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--red);text-align:center;">${err.message}</td></tr>`; }
}

async function toggleUser(userId, btn) {
  try {
    const result = await api(`/admin/users/${userId}/toggle`, { method: 'POST' });
    btn.textContent = result.is_active?'Deactivate':'Activate';
    btn.className   = `btn ${result.is_active?'btn-outline':'btn-green'} btn-sm`;
    showToast(`User ${result.is_active?'activated':'deactivated'}.`);
  } catch (err) { showToast(`❌ ${err.message}`); }
}

// ═══ MODALS ═══
function showModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(e) { if (e.target.id==='modal-overlay') closeAllModals(); }
function closeAllModals() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
}

// ═══ TOAST ═══
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.style.opacity='1';
  setTimeout(()=>t.style.opacity='0', 3000);
}

// ═══ FILE DOWNLOAD PLACEHOLDER ═══
function downloadMaterial(title) {
  const blob = new Blob([`BazeLP — ${title}\n\nDownloaded on ${new Date().toLocaleDateString()}.`],{type:'text/plain'});
  const link = document.createElement('a');
  link.href=URL.createObjectURL(blob); link.download=title.replace(/[^a-z0-9]+/gi,'_')+'.txt';
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  showToast('⬇️ Downloaded: ' + title);
}

// ═══ ADAPTIVE QUIZ (static study aid — no DB table required) ═══
const ADAPTIVE_QUESTIONS = [
  {topic:'Arrays',             q:'What is the time complexity of accessing an array element by index?',     studentAnswer:'', acceptable:['o(1)','constant','constant time']},
  {topic:'Linked Lists',       q:'What is the time complexity of inserting at the head of a linked list?', studentAnswer:'', acceptable:['o(1)','constant','constant time']},
  {topic:'Tree Traversal',     q:'In-order traversal visits nodes in which order?',                        studentAnswer:'', acceptable:['left root right','left, root, right']},
  {topic:'Graph Algorithms',   q:'Which data structure does BFS use to track nodes to visit?',             studentAnswer:'', acceptable:['queue']},
  {topic:'Dynamic Programming',q:'What does memoization avoid?',                                          studentAnswer:'', acceptable:['recomputing','repeated subproblem','recalculating']},
];
const ADAPTIVE_STUDY_CONTENT = {
  'Tree Traversal':      {title:'Tree traversal fundamentals',    minutes:45, materialKey:'trees'},
  'Graph Algorithms':    {title:'BFS and DFS graph search',       minutes:50, materialKey:'graphs'},
  'Dynamic Programming': {title:'Dynamic programming basics',     minutes:60, materialKey:'dp'},
  'Arrays':              {title:'Array operations and complexity', minutes:20, materialKey:null},
  'Linked Lists':        {title:'Linked list operations',         minutes:25, materialKey:null},
};
const LEARNING_MATERIALS = {
  trees:  {title:'Tree Traversal Fundamentals', icon:'🌳', video:'https://www.youtube.com/embed/9RHO6jU--GU', notes:['Pre-order: Root → Left → Right.','In-order: Left → Root → Right (sorted for BSTs).','Post-order: Left → Right → Root (for deletion).']},
  graphs: {title:'BFS & DFS Graph Search',      icon:'🕸️', video:'https://www.youtube.com/embed/cS-198wtfj0', notes:['BFS uses a queue; explores level by level.','DFS uses a stack or recursion.','Both run in O(V + E).']},
  dp:     {title:'Dynamic Programming Intro',   icon:'🧩', video:'https://www.youtube.com/embed/oBt53YbR9Kk', notes:['DP stores subproblem results to avoid recomputation.','Memoization = top-down; Tabulation = bottom-up.']},
};

function normalizeAnswer(str){return str.toLowerCase().replace(/[.,]/g,'').replace(/\s+/g,' ').trim();}
function isAnswerCorrect(item){const given=normalizeAnswer(item.studentAnswer);return item.acceptable.some(a=>given.includes(normalizeAnswer(a))||normalizeAnswer(a).includes(given));}

function renderAdaptiveQuiz() {
  const container=document.getElementById('adaptive-quiz-list');
  if(!container)return;
  // reset answers
  ADAPTIVE_QUESTIONS.forEach(q=>q.studentAnswer='');
  container.innerHTML=ADAPTIVE_QUESTIONS.map((item,i)=>`
    <div class="q-card" style="border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;background:#fff;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-bottom:6px;"><span>${item.topic}</span><span>Q${i+1}</span></div>
      <div style="font-size:13px;margin-bottom:8px;">${item.q}</div>
      <input class="input-field" value="${item.studentAnswer}" oninput="ADAPTIVE_QUESTIONS[${i}].studentAnswer=this.value" placeholder="Type your answer..."/>
    </div>`).join('');
  document.getElementById('adaptive-quiz-result').innerHTML='';
  populateAdaptiveCourseSelect();
}

async function populateAdaptiveCourseSelect() {
  const sel = document.getElementById('adaptive-course-select');
  if (!sel) return;
  try {
    const courses = await api('/adaptive/list-courses');
    if (!courses.length) {
      sel.innerHTML = '<option value="">Enroll in a course first</option>';
      return;
    }
    sel.innerHTML = courses.map(c => `<option value="${c.course_id}">${c.course_code} — ${c.title}</option>`).join('');
  } catch (err) {
    sel.innerHTML = '<option value="">Could not load courses</option>';
  }
}

async function submitAdaptiveQuiz() {
  const sel = document.getElementById('adaptive-course-select');
  const courseId = sel ? sel.value : '';
  if (!courseId) { showToast('Pick a course for this diagnostic first.'); return; }

  // grade locally to build the answers payload
  const answers = ADAPTIVE_QUESTIONS.map(item => {
    const correct = isAnswerCorrect(item);
    return {
      topic: item.topic,
      question_text: item.q,
      student_answer: item.studentAnswer || '',
      correct_answer: item.acceptable[0],
      is_correct: correct,
    };
  });

  const resultEl = document.getElementById('adaptive-quiz-result');
  resultEl.innerHTML = '<p style="color:var(--text-3);padding:16px;">Scoring and building your path...</p>';

  let res;
  try {
    res = await api('/adaptive/submit', { method: 'POST', body: { course_id: courseId, answers } });
  } catch (err) {
    resultEl.innerHTML = `<p style="color:var(--red);padding:16px;">${err.message}</p>`;
    return;
  }

  const { score_pct, correct, total, weak_topics, path, attempt_id } = res;
  const strongTopics = [...new Set(answers.filter(a=>a.is_correct).map(a=>a.topic))]
                        .filter(t=>!weak_topics.includes(t));

  resultEl.innerHTML = `
    <div class="panel" style="margin-top:16px;">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px;">
        <span style="font-size:26px;font-weight:700;">${score_pct}%</span>
        <span style="font-size:13px;color:var(--text-2);">${correct} of ${total} correct</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
        ${weak_topics.map(t=>`<span class="badge badge-red">${t}</span>`).join('')}
        ${strongTopics.map(t=>`<span class="badge badge-green">${t}</span>`).join('')}
      </div>
      <div class="panel-title">🗺️ Your Personalised Study Path</div>
      <div id="ai-path-steps">
        ${path.map((s,i)=>`
          <div class="ai-path-card" onclick="openAiExplanation('${attempt_id}', ${i+1}, '${encodeURIComponent(s.topic)}')" style="cursor:pointer;">
            <div class="ai-path-icon">${['🌳','🕸️','🧩','🔄','📖'][i]||'📖'}</div>
            <div class="ai-path-info">
              <h4>Step ${s.step_number}: ${s.step_title}</h4><p>${s.reason}</p>
              <div class="ai-tags">
                <span class="ai-tag" style="background:#fee2e2;color:#991b1b;">Needs Review</span>
                <span class="ai-tag" style="background:#f3f4f6;color:#4b5563;">~${s.estimated_mins} mins</span>
              </div>
            </div>
            <span class="badge badge-red" style="flex-shrink:0;">Start</span>
          </div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--text-3);margin-top:10px;">Saved to your record. Tap any step for an AI explanation.</p>
    </div>`;
}

// Calls the in-app Claude API to generate a tailored explanation for a weak topic.
async function openAiExplanation(attemptId, stepNumber, topicEnc) {
  const topic = decodeURIComponent(topicEnc);
  document.getElementById('path-detail-content').innerHTML = `
    <div class="panel">
      <div class="panel-title">🤖 Generating your explanation for ${topic}...</div>
      <p style="color:var(--text-3);">Claude is preparing a focused lesson. One moment.</p>
    </div>`;
  showPage('s-path-detail');

  const prompt = `You are a computer science tutor. A student struggled with the topic "${topic}" on a diagnostic quiz. Write a concise, focused mini-lesson to help them. Use plain language. Structure it as: a 2-sentence intuition, then 3 to 4 key points as a list, then one short worked example. Keep it under 220 words. Do not use markdown headers.`;

  let lessonText = '';
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await r.json();
    lessonText = (data.content || []).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
  } catch (err) {
    lessonText = '';
  }

  if (!lessonText) {
    // graceful fallback if the API is unavailable
    lessonText = `Quick review of ${topic}:\n\n• Revisit the core definition and why it matters.\n• Work through one small example by hand.\n• Re-attempt the quiz question that tripped you up.`;
  }

  const safe = lessonText
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\n/g,'<br>');

  document.getElementById('path-detail-content').innerHTML = `
    <div class="panel">
      <div class="panel-title">📖 ${topic}</div>
      <div style="font-size:14px;line-height:1.8;color:var(--text-2);">${safe}</div>
      <button class="btn btn-green" style="margin-top:16px;"
        onclick="completeAiStep('${attemptId}', ${stepNumber})">Mark Step Complete</button>
    </div>`;
}

async function completeAiStep(attemptId, stepNumber) {
  try {
    await api(`/adaptive/path-step/${attemptId}/${stepNumber}/complete`, { method: 'POST' });
    showToast('✅ Step marked complete');
  } catch (err) { showToast(`❌ ${err.message}`); }
  showPage('s-adaptive');
}

function openLearningMaterial(topic) {
  const m=LEARNING_MATERIALS[topic];
  if(!m){showToast('Material not found.');return;}
  document.getElementById('path-detail-content').innerHTML=`
    <div class="panel">
      <div class="panel-title">${m.icon} ${m.title}</div>
      ${m.video?`<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:var(--radius);overflow:hidden;margin-bottom:20px;"><iframe src="${m.video}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`:''}
      <ul style="padding-left:20px;line-height:1.9;font-size:14px;color:var(--text-2);">${m.notes.map(n=>`<li>${n}</li>`).join('')}</ul>
      <button class="btn btn-green" style="margin-top:16px;" onclick="showToast('✅ Marked as complete!');showPage('s-adaptive')">Mark as Complete</button>
    </div>`;
  showPage('s-path-detail');
}

// ═══ COPY/PASTE LOCK DURING EXAM ═══
document.addEventListener('copy',  e=>{if(document.getElementById('s-exam-taking')&&!document.getElementById('s-exam-taking').classList.contains('hidden'))e.preventDefault();});
document.addEventListener('paste', e=>{if(document.getElementById('s-exam-taking')&&!document.getElementById('s-exam-taking').classList.contains('hidden'))e.preventDefault();});
