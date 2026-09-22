const clinicState = {
    patients: [],
    appointments: [],
    queue: [],
    staffAttendance: [
        {
            name: 'Ramesh Kumar',
            role: 'Receptionist',
            status: 'Present',
            date: new Date().toISOString().slice(0, 10)
        },
        {
            name: 'Sonia Rani',
            role: 'Nurse',
            status: 'Present',
            date: new Date().toISOString().slice(0, 10)
        },
        {
            name: 'Vikram Rao',
            role: 'Cleaner',
            status: 'Leave',
            date: new Date().toISOString().slice(0, 10)
        }
    ],
    token: 0,
    currentPatient: '',
    currentDoctor: '',
    doctors: [
        {
            name: 'Dr. Ravi Kumar',
            specialty: 'General Physician',
            available: true,
            time: '9:00 AM - 1:00 PM'
        },
        {
            name: 'Dr. Priya Sharma',
            specialty: 'Cardiologist',
            available: true,
            time: '11:00 AM - 4:00 PM'
        },
        {
            name: 'Dr. Arjun Reddy',
            specialty: 'Dermatologist',
            available: false,
            time: 'On leave'
        }
    ]
};

const STORAGE_KEY = 'mediCareClinicEncryptedState';

function getCrypto() {
    const cryptoApi = window.crypto || globalThis.crypto;
    if (!cryptoApi || !cryptoApi.subtle) {
        throw new Error('Web Crypto API is not supported in this browser.');
    }
    return cryptoApi;
}

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function fromBase64(base64Text) {
    const binary = atob(base64Text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function deriveEncryptionKey() {
    const cryptoApi = getCrypto();
    const encoder = new TextEncoder();
    const passphrase = 'MediCareClinic-2026-Encrypted';
    const keyMaterial = await cryptoApi.subtle.importKey(
        'raw',
        encoder.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return cryptoApi.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('mediCareClinicSalt'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        {
            name: 'AES-GCM',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptText(value) {
    const cryptoApi = getCrypto();
    const key = await deriveEncryptionKey();
    const iv = cryptoApi.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await cryptoApi.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(value)
    );

    return `${toBase64(iv)}:${toBase64(encryptedBuffer)}`;
}

async function decryptText(value) {
    if (!value) {
        return '';
    }

    const cryptoApi = getCrypto();
    const key = await deriveEncryptionKey();
    const [ivString, encryptedString] = value.split(':');

    if (!ivString || !encryptedString) {
        throw new Error('Invalid encrypted value.');
    }

    const iv = fromBase64(ivString);
    const encryptedData = fromBase64(encryptedString);
    const decrypted = await cryptoApi.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
    );

    return new TextDecoder().decode(decrypted);
}

async function hashValue(value) {
    const cryptoApi = getCrypto();
    const buffer = await cryptoApi.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(String(value))
    );

    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

async function persistEncryptedClinicState() {
    const safeState = JSON.parse(JSON.stringify(clinicState));

    try {
        const encryptedState = await encryptText(JSON.stringify(safeState));
        localStorage.setItem(STORAGE_KEY, encryptedState);
    } catch (error) {
        console.error('Failed to persist clinic data securely:', error);
    }
}

async function loadEncryptedClinicState() {
    try {
        const encryptedState = localStorage.getItem(STORAGE_KEY);
        if (!encryptedState) {
            return;
        }

        const decryptedState = await decryptText(encryptedState);
        const parsedState = JSON.parse(decryptedState);

        clinicState.patients = parsedState.patients || [];
        clinicState.appointments = parsedState.appointments || [];
        clinicState.queue = parsedState.queue || [];
        clinicState.token = Number(parsedState.token || 0);
        clinicState.currentPatient = parsedState.currentPatient || '';
        clinicState.currentDoctor = parsedState.currentDoctor || '';
        clinicState.doctors = parsedState.doctors || clinicState.doctors;

        for (const patient of clinicState.patients) {
            if (!patient.securityPinHash) {
                patient.securityPinHash = await hashValue(String(patient.phone).slice(-4));
            }
        }
    } catch (error) {
        console.error('Failed to load encrypted clinic data:', error);
        localStorage.removeItem(STORAGE_KEY);
    }
}

function showSection(sectionId) {
    const sections = document.querySelectorAll('.section');
    sections.forEach((section) => {
        section.classList.remove('active');
    });

    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add('active');
    }
}

function showDashboard() {
    showSection('dashboard');
}

const APPOINTMENT_EXTENSION_HOURS = 5;

function getAppointmentStart(appointment) {
    const appointmentStart = new Date(`${appointment.date}T${appointment.time}`);
    return Number.isNaN(appointmentStart.getTime()) ? null : appointmentStart;
}

function getAppointmentStatus(appointment) {
    if (appointment.attended) {
        return 'Attended';
    }

    const appointmentStart = getAppointmentStart(appointment);
    if (!appointmentStart || Date.now() < appointmentStart.getTime()) {
        return 'Scheduled';
    }

    const extensionEnd = appointmentStart.getTime() + APPOINTMENT_EXTENSION_HOURS * 60 * 60 * 1000;
    return Date.now() <= extensionEnd ? 'Extended' : 'Expired';
}

function getAppointmentExtensionEnd(appointment) {
    const appointmentStart = getAppointmentStart(appointment);
    if (!appointmentStart) return 'Unavailable';

    const extensionEnd = new Date(
        appointmentStart.getTime() + APPOINTMENT_EXTENSION_HOURS * 60 * 60 * 1000
    );
    return extensionEnd.toLocaleString();
}

async function markAppointmentAttended(token) {
    const appointment = clinicState.appointments.find((item) => item.token === token);
    const queueEntry = clinicState.queue.find((item) => item.token === token);

    if (!appointment) return;

    appointment.attended = true;
    if (queueEntry) {
        queueEntry.attended = true;
    }

    await persistEncryptedClinicState();
    renderAppointments();
    renderQueue();
}

function renderPatients() {
    const patientList = document.getElementById('patientList');
    const patientCount = document.getElementById('patientCount');

    if (patientCount) {
        patientCount.textContent = clinicState.patients.length;
    }

    if (!patientList) return;

    if (clinicState.patients.length === 0) {
        patientList.innerHTML = '<p>No patients registered yet.</p>';
        return;
    }

    patientList.innerHTML = clinicState.patients
        .map((patient, index) => `
            <div class="patient-item">
                <h3>${index + 1}. ${patient.name}</h3>
                <p><strong>Age:</strong> ${patient.age}</p>
                <p><strong>Gender:</strong> ${patient.gender}</p>
                <p><strong>Phone:</strong> ${patient.phone}</p>
                <p><strong>Problem:</strong> ${patient.problem}</p>
            </div>
        `)
        .join('');
}

function renderAppointments() {
    const appointmentList = document.getElementById('appointmentList');
    const appointmentCount = document.getElementById('appointmentCount');

    if (appointmentCount) {
        appointmentCount.textContent = clinicState.appointments.length;
    }

    if (!appointmentList) return;

    if (clinicState.appointments.length === 0) {
        appointmentList.innerHTML = '<p>No appointments booked yet.</p>';
        return;
    }

    appointmentList.innerHTML = clinicState.appointments
        .map((appointment, index) => `
            <div class="appointment-item">
                <h3>${index + 1}. ${appointment.patient}</h3>
                <p><strong>Doctor:</strong> ${appointment.doctor}</p>
                <p><strong>Date:</strong> ${appointment.date}</p>
                <p><strong>Time:</strong> ${appointment.time}</p>
                <p><strong>Priority:</strong> ${appointment.priority}</p>
                <p><strong>Status:</strong> ${getAppointmentStatus(appointment)}</p>
                <p><strong>Extended until:</strong> ${getAppointmentExtensionEnd(appointment)}</p>
                ${appointment.attended ? '' : `<button type="button" onclick="markAppointmentAttended(${appointment.token})">Mark Patient Attended</button>`}
            </div>
        `)
        .join('');
}

function renderQueue() {
    const queueList = document.getElementById('queueList');
    const queueToken = document.getElementById('queueToken');

    if (queueToken) {
        queueToken.textContent = clinicState.token;
    }

    if (!queueList) return;

    if (clinicState.queue.length === 0) {
        queueList.innerHTML = '<p>No patients in the queue yet.</p>';
        return;
    }

    queueList.innerHTML = clinicState.queue
        .map((entry, index) => `
            <div class="queue-item">
                <h3>${index + 1}. ${entry.patient}</h3>
                <p><strong>Token:</strong> ${entry.token}</p>
                <p><strong>Doctor:</strong> ${entry.doctor}</p>
                <p><strong>Appointment Time:</strong> ${entry.time}</p>
                <p><strong>Status:</strong> ${getAppointmentStatus(entry)}</p>
                <p><strong>Extended until:</strong> ${getAppointmentExtensionEnd(entry)}</p>
                ${entry.attended ? '' : `<button type="button" onclick="markAppointmentAttended(${entry.token})">Mark Patient Attended</button>`}
            </div>
        `)
        .join('');
}

function renderStaffAttendance() {
    const attendanceList = document.getElementById('attendanceList');
    const attendanceSummary = document.getElementById('attendanceSummary');

    if (!attendanceList || !attendanceSummary) return;

    const presentCount = clinicState.staffAttendance.filter((staff) => staff.status === 'Present').length;
    const absentCount = clinicState.staffAttendance.filter((staff) => staff.status === 'Absent').length;
    const leaveCount = clinicState.staffAttendance.filter((staff) => staff.status === 'Leave').length;

    attendanceSummary.innerHTML = `
        <div class="attendance-summary-box">
            <div><strong>Present:</strong> ${presentCount}</div>
            <div><strong>Absent:</strong> ${absentCount}</div>
            <div><strong>Leave:</strong> ${leaveCount}</div>
        </div>
    `;

    if (clinicState.staffAttendance.length === 0) {
        attendanceList.innerHTML = '<p>No staff attendance recorded yet.</p>';
        return;
    }

    attendanceList.innerHTML = clinicState.staffAttendance
        .map((staff, index) => `
            <div class="attendance-card">
                <h3>${index + 1}. ${staff.name}</h3>
                <p><strong>Role:</strong> ${staff.role}</p>
                <p><strong>Date:</strong> ${staff.date}</p>
                <span class="attendance-status ${staff.status.toLowerCase()}">
                    ${staff.status}
                </span>
            </div>
        `)
        .join('');
}

function generateToken() {
    clinicState.token += 1;
    const queueToken = document.getElementById('queueToken');
    if (queueToken) {
        queueToken.textContent = clinicState.token;
    }
    return clinicState.token;
}

function checkDoctorAvailability(doctorName) {
    const doctor = clinicState.doctors.find((item) => item.name === doctorName);
    if (!doctor) return;

    if (!doctor.available) {
        alert(`${doctor.name} is not available right now.`);
        return;
    }

    clinicState.currentDoctor = doctor.name;
    const appointmentDoctor = document.getElementById('appointmentDoctor');
    if (appointmentDoctor) {
        appointmentDoctor.value = doctor.name;
    }

    showSection('appointments');
    alert(`${doctor.name} is available. Please continue with the appointment.`);
}

function bookDoctor(doctorName) {
    checkDoctorAvailability(doctorName);
}

function renderAppointmentDoctorOptions() {
    const appointmentDoctor = document.getElementById('appointmentDoctor');
    if (!appointmentDoctor) return;

    const availableDoctors = clinicState.doctors.filter((doctor) => doctor.available);

    appointmentDoctor.innerHTML = `
        <option value="">Select Doctor</option>
        ${availableDoctors
            .map((doctor) => `<option value="${doctor.name}">${doctor.name}</option>`)
            .join('')}
    `;

    if (clinicState.currentDoctor) {
        appointmentDoctor.value = clinicState.currentDoctor;
    }
}

function searchPatient() {
    const searchInput = document.getElementById('searchPatient');
    const recordsList = document.getElementById('recordsList');

    if (!searchInput || !recordsList) return;

    const query = searchInput.value.trim().toLowerCase();

    if (query === '') {
        renderPatientRecords(clinicState.patients);
        return;
    }

    const filteredPatients = clinicState.patients.filter((patient) =>
        patient.name.toLowerCase().includes(query)
        || patient.problem.toLowerCase().includes(query)
        || patient.phone.includes(query)
    );

    renderPatientRecords(filteredPatients);
}

function renderPatientRecords(patients) {
    const recordsList = document.getElementById('recordsList');

    if (!recordsList) return;

    if (patients.length === 0) {
        recordsList.innerHTML = '<p>No matching patient record found.</p>';
        return;
    }

    recordsList.innerHTML = patients
        .map((patient, index) => `
            <div class="record-item">
                <h3>${index + 1}. ${patient.name}</h3>
                <p><strong>Age:</strong> ${patient.age}</p>
                <p><strong>Gender:</strong> ${patient.gender}</p>
                <p><strong>Phone:</strong> ${patient.phone}</p>
                <p><strong>Symptoms:</strong> ${patient.problem}</p>
            </div>
        `)
        .join('');
}

function renderDoctors() {
    const doctorList = document.getElementById('doctorList');
    if (!doctorList) return;

    doctorList.innerHTML = clinicState.doctors
        .map((doctor) => `
            <div class="doctor-card">
                <h3>${doctor.name}</h3>
                <p>${doctor.specialty}</p>
                <p><strong>Timing:</strong> ${doctor.time}</p>
                <p><strong>Availability Status:</strong> <span class="${doctor.available ? 'available' : 'unavailable'}">
                    ${doctor.available ? 'Available' : 'Unavailable'}
                </span></p>
                <p><strong>Details:</strong> ${doctor.available ? 'Accepting appointments' : 'Currently not accepting appointments'}</p>
                <button onclick="bookDoctor('${doctor.name}')" ${doctor.available ? '' : 'disabled'}>
                    ${doctor.available ? 'Check Availability' : 'Unavailable'}
                </button>
            </div>
        `)
        .join('');
}

function getAssistantLanguageSettings(language) {
    const settings = {
        en: {
            speech: 'en-US',
            recognition: 'en-US'
        },
        hi: {
            speech: 'hi-IN',
            recognition: 'hi-IN'
        },
        te: {
            speech: 'te-IN',
            recognition: 'te-IN'
        }
    };

    return settings[language] || settings.en;
}

function detectMessageLanguage(messageText) {
    const text = messageText.toLowerCase();

    if (/[\u0900-\u097F]/.test(messageText) || /(namaste|namaskar|hai|mein|dard|bukhar|sardi|khansi|medicine|dawai)/.test(text)) {
        return 'hi';
    }

    if (/[\u0C00-\u0C7F]/.test(messageText) || /(namaskaram|meeru|andaru|jvaram|dardham|sardi|khanshi|medicines|dava)/.test(text)) {
        return 'te';
    }

    return 'en';
}

function generateAssistantReply(messageText, language = 'en') {
    const text = messageText.toLowerCase();
    const detectedLanguage = detectMessageLanguage(messageText);
    const selectedLanguage = language || detectedLanguage;

    const doctorList = clinicState.doctors
        .map((doctor) => {
            const status = doctor.available ? 'Available' : 'Not Available';
            const timeText = doctor.available ? ` - ${doctor.time}` : '';
            return `${doctor.name} (${status})${timeText}`;
        })
        .join(', ');

    const queuePreview = clinicState.queue.length > 0
        ? clinicState.queue.map((entry) => `${entry.patient}: Token ${entry.token}`).join('; ')
        : 'No patients in the queue right now.';

    const templates = {
        en: {
            doctorAvailability: `Doctor availability status: ${doctorList}. Available doctors are ${clinicState.doctors.filter((d) => d.available).map((d) => d.name).join(', ')}.`,
            token: `Your current token number is ${clinicState.token || 0}. If you have an appointment, please wait for your turn in the queue.`,
            appointment: 'To register an appointment, first enter the patient details, then check doctor availability, choose an available doctor, and submit the appointment form. After that, a token will be generated automatically.',
            queue: `Current queue status: ${queuePreview}. Please wait for your turn.`,
            fever: 'Thank you for telling us. Please rest, drink plenty of water, and avoid heavy activity. If the fever is high or lasts more than 24 hours, please visit the clinic urgently.',
            pain: 'I understand you are in pain. Please keep yourself hydrated and avoid stress. If the pain is severe or sudden, contact the clinic immediately.',
            cough: 'Please take rest, drink warm fluids, and avoid crowded places. If the symptoms worsen, let us know and we will guide the next step.',
            medicine: 'Your prescription will be reviewed by the doctor. Please follow the instructions carefully and report any side effects.',
            default: 'Thank you for your message. Our clinic team is reviewing your concern, and we will guide you with the next steps soon.'
        },
        hi: {
            doctorAvailability: `डॉक्टर उपलब्धता: ${doctorList}. उपलब्ध डॉक्टर हैं ${clinicState.doctors.filter((d) => d.available).map((d) => d.name).join(', ')}.`,
            token: `आपका वर्तमान टोकन नंबर ${clinicState.token || 0} है। अगर आपका अपॉइंटमेंट है, तो कृपया कतार में अपनी बारी का इंतजार करें।`,
            appointment: 'अपॉइंटमेंट रजिस्टर करने के लिए पहले मरीज की जानकारी भरें, फिर डॉक्टर की उपलब्धता देखें, उपलब्ध डॉक्टर को चुनें, और अपॉइंटमेंट फॉर्म सबमिट करें। उसके बाद टोकन अपने आप बन जाएगा।',
            queue: `वर्तमान कतार स्थिति: ${queuePreview}. कृपया अपनी बारी का इंतजार करें।`,
            fever: 'हमें बताने के लिए धन्यवाद। कृपया आराम करें, अधिक पानी पिएँ और भारी गतिविधि से बचें। अगर बुखार बहुत ज्यादा है या 24 घंटे से अधिक रहता है, तो तुरंत क्लिनिक आएँ।',
            pain: 'मैं समझता हूँ कि आपको दर्द हो रहा है। कृपया खूब पानी पिएँ और तनाव से बचें। अगर दर्द बहुत तेज या अचानक हो, तो तुरंत क्लिनिक से संपर्क करें।',
            cough: 'कृपया आराम करें, गर्म पेय पिएँ और भीड़ वाली जगहों से बचें। अगर लक्षण खराब हों, तो हमें बताइए, हम अगली सलाह देंगे।',
            medicine: 'आपका प्रिस्क्रिप्शन डॉक्टर द्वारा देखा जाएगा। कृपया निर्देशों का पालन करें और कोई भी दुष्प्रभाव होने पर तुरंत बताएं।',
            default: 'आपके संदेश के लिए धन्यवाद। हमारी क्लिनिक टीम आपके सवाल का निपटारा करने के लिए तैयार है और हम जल्द ही अगला कदम बताएँगे।'
        },
        te: {
            doctorAvailability: `వైద్యుల లభ్యత: ${doctorList}. అందుబాటులో ఉన్న వైద్యులు ${clinicState.doctors.filter((d) => d.available).map((d) => d.name).join(', ')}.`,
            token: `మీ ప్రస్తుత టోకెన్ నంబర్ ${clinicState.token || 0}. అపాయింట్‌మెంట్ ఉంటే, క్యూలో మీ sıra వచ్చే వరకు వేచి ఉండండి.`,
            appointment: 'అపాయింట్‌మెంట్‌ను రిజిస్టర్ చేయటానికి మొదట పేషెంట్ వివరాలను నమోదు చేయండి, తర్వాత వైద్యుల లభ్యతను చూశి, అందుబాటులో ఉన్న వైద్యుని ఎంచుకోండి, అపాయింట్‌మెంట్ ఫారం‌ను సబ్మిట్ చేయండి. తర్వాత టోకెన్ ఆటోమేటిక్గా 생성ుతుంది.',
            queue: `ప్రస్తుత క్యూలో స్థితి: ${queuePreview}. మీ sıra వచ్చే వరకు వేచి ఉండండి.`,
            fever: 'చెప్పినందుకు ధన్యవాదాలు. విశ్రాంతి తీసుకోండి, ఎక్కువ నీరు తీసుకోండి మరియు బరువైన పనులు చేయకండి. జ్వరం ఎక్కువగా ఉంటే లేదా 24 గంటల తర్వాత కూడా కొనసాగితే, క్షణమే క్లినిక్కు వచ్చండి.',
            pain: 'మీకు నొప్పి ఉంది అని అర్థమైంది. సరిపడ నీరు తీసుకుని, ఒత్తిడిని తగ్గించండి. నొప్పి తీవ్రమైన లేదా అక sudden అయితే, వెంటనే క్లినిక్కు సంప్రదించండి.',
            cough: 'విశ్రాంతి తీసుకోండి, వెచ్చని పానీయాలు తీసుకోండి మరియు అధిక జన సందడి ఉండే ప్రదేశాలను నివారించండి. లక్షణాలు పెరగడం మొదలైతే, మాకు చెప్పండి, తర్వాత సూచన ఇస్తాము.',
            medicine: 'మీ ఔషధ సూచన వైద్యునిచే పరిశీలించబడుతుంది. సూచనలను కచ్చితంగా పాటించండి మరియు ఎలాంటి సైడ్ ఎఫెక్ట్స్ ఉంటే వెంటనే చెప్పండి.',
            default: 'మీ సందేశానికి ధన్యవాదాలు. మా క్లినిక్ టీం మీ సమస్యను పరిశీలిస్తోంది మరియు తదుపరి సూచనలు త్వరలో ఇస్తుంది.'
        }
    };

    const isDoctorQuery = /(doctor|doctors|availability|available|not available|specialist|physician|cardiologist|dermatologist|वैद्य|डॉक्टर|వైద్యులు)/.test(text);
    const isTokenQuery = /(token|tokan|my token|queue number|number|टोकन|టోకెన్|సంఖ్య)/.test(text);
    const isAppointmentQuery = /(appointment|book|register|schedule|book appointment|register appointment|अपॉइंटमेंट|అపాయింట్‌మెంట్|బుక్|నియోజకం)/.test(text);
    const isQueueQuery = /(queue|waiting|line|check queue|waiting list|how many people|कतार|క్యూ|వేచివుండటం)/.test(text);

    if (isDoctorQuery) return templates[selectedLanguage].doctorAvailability;
    if (isTokenQuery) return templates[selectedLanguage].token;
    if (isAppointmentQuery) return templates[selectedLanguage].appointment;
    if (isQueueQuery) return templates[selectedLanguage].queue;

    const key =
        text.includes('fever') || text.includes('bukh') || text.includes('jvara') || text.includes('jwaram') || text.includes('jvaram')
            ? 'fever'
            : text.includes('pain') || text.includes('dard') || text.includes('headache') || text.includes('noppu') || text.includes('dardham')
                ? 'pain'
                : text.includes('cough') || text.includes('cold') || text.includes('khansi') || text.includes('sardi') || text.includes('khanshi')
                    ? 'cough'
                    : text.includes('medicine') || text.includes('prescription') || text.includes('dawai') || text.includes('medicines') || text.includes('dava')
                        ? 'medicine'
                        : 'default';

    return templates[selectedLanguage][key] || templates.en.default;
}

function addChatMessage(sender, message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageBox = document.createElement('div');
    messageBox.className = `message ${sender === 'Patient' ? 'patient-message' : 'assistant-message'}`;
    messageBox.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatMessages.appendChild(messageBox);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendVoiceReply() {
    const patientInput = document.getElementById('patientInput');
    const assistantLanguage = document.getElementById('assistantLanguage');

    if (!patientInput) return;

    const patientMessage = patientInput.value.trim();

    if (!patientMessage) {
        alert('Please enter the patient message first.');
        return;
    }

    const selectedLanguage = assistantLanguage ? assistantLanguage.value : 'en';
    const assistantReply = generateAssistantReply(patientMessage, selectedLanguage);

    addChatMessage('Patient', patientMessage);
    addChatMessage('AI Assistant', assistantReply);

    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(assistantReply);
        const languageSettings = getAssistantLanguageSettings(selectedLanguage);
        utterance.lang = languageSettings.speech;
        utterance.rate = 1;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }

    patientInput.value = '';
}

function startVoiceInput() {
    const patientInput = document.getElementById('patientInput');
    const assistantLanguage = document.getElementById('assistantLanguage');
    if (!patientInput) return;

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Voice input is not supported in this browser. Please type the message instead.');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    const selectedLanguage = assistantLanguage ? assistantLanguage.value : 'en';
    const languageSettings = getAssistantLanguageSettings(selectedLanguage);

    recognition.lang = languageSettings.recognition;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.start();

    recognition.onresult = function (event) {
        const transcript = event.results[0][0].transcript;
        patientInput.value = transcript;
    };

    recognition.onerror = function () {
        alert('Voice input failed. Please try again or type the message manually.');
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadEncryptedClinicState();

    const patientForm = document.getElementById('patientForm');
    const appointmentForm = document.getElementById('appointmentForm');
    const billingForm = document.getElementById('billingForm');
    const patientSecurityForm = document.getElementById('patientSecurityForm');
    const sendPatientMessageButton = document.getElementById('sendPatientMessage');
    const voiceInputButton = document.getElementById('voiceInputButton');
    const voiceReplyButton = document.getElementById('voiceReplyButton');

    if (patientSecurityForm) {
        patientSecurityForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const patientName = document.getElementById('securityPatientName').value.trim();
            const patientPhone = document.getElementById('securityPatientPhone').value.trim();
            const patientPin = document.getElementById('securityPatientPin').value.trim();
            const securityMessage = document.getElementById('securityMessage');

            const patient = clinicState.patients.find((item) =>
                item.name.toLowerCase() === patientName.toLowerCase() &&
                item.phone === patientPhone
            );

            if (!patient) {
                if (securityMessage) {
                    securityMessage.textContent = 'Patient not found. Please register first.';
                    securityMessage.className = 'security-message error';
                }
                return;
            }

            const pinHash = await hashValue(patientPin);
            const validPinHash = patient.securityPinHash || await hashValue(String(patient.phone).slice(-4));

            if (pinHash !== validPinHash) {
                if (securityMessage) {
                    securityMessage.textContent = 'Incorrect PIN. Please use the last 4 digits of your phone number.';
                    securityMessage.className = 'security-message error';
                }
                return;
            }

            if (securityMessage) {
                securityMessage.textContent = `Access granted for ${patient.name}. Patient record is secure and available.`;
                securityMessage.className = 'security-message success';
            }

            showSection('records');
            searchPatient();
        });
    }

    if (sendPatientMessageButton) {
        sendPatientMessageButton.addEventListener('click', () => {
            const patientInput = document.getElementById('patientInput');
            const assistantLanguage = document.getElementById('assistantLanguage');
            if (!patientInput) return;

            const message = patientInput.value.trim();
            if (!message) {
                alert('Please type the patient message.');
                return;
            }

            const selectedLanguage = assistantLanguage ? assistantLanguage.value : 'en';
            addChatMessage('Patient', message);
            addChatMessage('AI Assistant', generateAssistantReply(message, selectedLanguage));
            patientInput.value = '';
        });
    }

    if (voiceInputButton) {
        voiceInputButton.addEventListener('click', startVoiceInput);
    }

    if (voiceReplyButton) {
        voiceReplyButton.addEventListener('click', sendVoiceReply);
    }

    if (patientForm) {
        patientForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const name = document.getElementById('patientName').value.trim();
            const age = document.getElementById('patientAge').value.trim();
            const gender = document.getElementById('patientGender').value;
            const phone = document.getElementById('patientPhone').value.trim();
            const problem = document.getElementById('patientProblem').value.trim();

            if (!name || !age || !gender || !phone || !problem) {
                alert('Please fill in all patient details.');
                return;
            }

            const securityPinHash = await hashValue(String(phone).slice(-4));

            clinicState.patients.push({
                name,
                age,
                gender,
                phone,
                problem,
                securityPinHash
            });

            clinicState.currentPatient = name;
            const appointmentPatient = document.getElementById('appointmentPatient');
            if (appointmentPatient) {
                appointmentPatient.value = name;
            }

            await persistEncryptedClinicState();
            renderPatients();
            renderPatientRecords(clinicState.patients);
            renderAppointmentDoctorOptions();
            showSection('doctors');
            patientForm.reset();
        });
    }

    if (appointmentForm) {
        appointmentForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const patient = document.getElementById('appointmentPatient').value.trim();
            const doctor = document.getElementById('appointmentDoctor').value;
            const date = document.getElementById('appointmentDate').value;
            const time = document.getElementById('appointmentTime').value;
            const priority = document.getElementById('appointmentPriority').value;

            if (!patient || !doctor || !date || !time) {
                alert('Please complete all appointment details.');
                return;
            }

            const selectedDoctor = clinicState.doctors.find((item) => item.name === doctor);
            if (!selectedDoctor || !selectedDoctor.available) {
                alert('Selected doctor is not available. Please choose another doctor.');
                return;
            }

            const token = generateToken();
            clinicState.appointments.push({
                patient,
                doctor,
                date,
                time,
                priority,
                token,
                attended: false
            });
            clinicState.queue.push({
                patient,
                doctor,
                date,
                time,
                token,
                attended: false
            });

            await persistEncryptedClinicState();
            renderAppointments();
            renderQueue();
            showSection('queue');
            appointmentForm.reset();
            renderAppointmentDoctorOptions();
        });
    }

    if (billingForm) {
        billingForm.addEventListener('submit', function (event) {
            event.preventDefault();

            const billPatient = document.getElementById('billPatient').value.trim();
            const consultationFee = Number(document.getElementById('consultationFee').value || 0);
            const medicineFee = Number(document.getElementById('medicineFee').value || 0);
            const total = consultationFee + medicineFee;
            const billResult = document.getElementById('billResult');

            if (!billPatient || consultationFee <= 0) {
                alert('Please enter patient name and consultation fee.');
                return;
            }

            if (billResult) {
                billResult.innerHTML = `
                    <div class="patient-item">
                        <h3>Bill for ${billPatient}</h3>
                        <p><strong>Consultation Fee:</strong> $${consultationFee}</p>
                        <p><strong>Medicine Fee:</strong> $${medicineFee}</p>
                        <p><strong>Total:</strong> $${total}</p>
                    </div>
                `;
            }

            billingForm.reset();
        });
    }

    const attendanceForm = document.getElementById('attendanceForm');
    if (attendanceForm) {
        attendanceForm.addEventListener('submit', async function (event) {
            event.preventDefault();

            const staffName = document.getElementById('staffName').value.trim();
            const staffRole = document.getElementById('staffRole').value.trim();
            const staffStatus = document.getElementById('staffStatus').value;
            const attendanceDate = document.getElementById('attendanceDate').value;

            if (!staffName || !staffRole || !staffStatus || !attendanceDate) {
                alert('Please complete all attendance fields.');
                return;
            }

            clinicState.staffAttendance.push({
                name: staffName,
                role: staffRole,
                status: staffStatus,
                date: attendanceDate
            });

            await persistEncryptedClinicState();
            renderStaffAttendance();
            attendanceForm.reset();
        });
    }

    renderPatients();
    renderAppointments();
    renderDoctors();
    renderAppointmentDoctorOptions();
    renderPatientRecords(clinicState.patients);
    renderQueue();
    renderStaffAttendance();
    const queueToken = document.getElementById('queueToken');
    if (queueToken) {
        queueToken.textContent = clinicState.token;
    }

    setInterval(() => {
        renderAppointments();
        renderQueue();
    }, 60000);
});
