
"use strict";

// ======================================
// QR-BASED SMART ATTENDANCE SYSTEM
// MAIN JAVASCRIPT
// ======================================

const API = {
    students: "/api/students",
    attendance: "/api/attendance",
    summary: "/api/summary",
    weekly: "/api/weekly",
    generateQR: "/api/generate-qr",
    report: "/api/report"
};

let weeklyChart = null;
let attendanceChart = null;
let currentQR = null;
let currentQRLink = null;


// ======================================
// COMMON API FUNCTION
// ======================================

async function apiRequest(url, options = {}) {
    const response = await fetch(url, options);

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(result.error || "Something went wrong.");
    }

    return result;
}


// ======================================
// SHOW MESSAGE
// ======================================

function showMessage(elementId, message, success = true) {
    const element = document.getElementById(elementId);

    if (!element) return;

    element.textContent = message;
    element.className = success
        ? "message"
        : "message error";
}


// ======================================
// PAGE NAVIGATION
// ======================================

function openPage(pageId) {
    const pages = document.querySelectorAll(".page");
    const links = document.querySelectorAll(".nav-link");

    pages.forEach(page => {
        page.classList.toggle("active", page.id === pageId);
    });

    links.forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === pageId
        );
    });

    const titles = {
        dashboard: "Dashboard",
        students: "Students",
        attendance: "Attendance",
        qr: "QR Generator",
        reports: "Reports"
    };

    document.getElementById("pageTitle").textContent =
        titles[pageId] || "Dashboard";

    document.getElementById("sidebar").classList.remove("open");

    if (pageId === "dashboard") {
        loadDashboard();
    }

    if (pageId === "students") {
        loadStudents();
    }

    if (pageId === "attendance") {
        loadAttendance();
    }

    if (pageId === "reports") {
        loadDashboard();
    }
}


// ======================================
// NAVIGATION BUTTONS
// ======================================

document.querySelectorAll(".nav-link").forEach(button => {
    button.addEventListener("click", () => {
        openPage(button.dataset.page);
    });
});


// QUICK ACTION BUTTONS

document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => {
        openPage(button.dataset.go);
    });
});


// ======================================
// MOBILE MENU
// ======================================

document.getElementById("menuBtn").addEventListener(
    "click",
    () => {
        document.getElementById("sidebar").classList.toggle("open");
    }
);


// ======================================
// CURRENT DATE
// ======================================

function displayDate() {
    const dateElement = document.getElementById("todayDate");

    dateElement.textContent = new Date().toLocaleDateString(
        "en-IN",
        {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );
}


// ======================================
// LOAD DASHBOARD SUMMARY
// ======================================

async function loadSummary() {
    try {
        const data = await apiRequest(API.summary);

        document.getElementById("totalStudents").textContent =
            data.total;

        document.getElementById("presentStudents").textContent =
            data.present;

        document.getElementById("absentStudents").textContent =
            data.absent;

        document.getElementById("attendanceRate").textContent =
            data.percentage + "%";

        document.getElementById("reportTotal").textContent =
            data.total;

        document.getElementById("reportPresent").textContent =
            data.present;

        document.getElementById("reportAbsent").textContent =
            data.absent;

        document.getElementById("reportUnmarked").textContent =
            data.unmarked;

        updateAttendanceChart(data);

    } catch (error) {
        console.error("Summary error:", error);
    }
}


// ======================================
// ATTENDANCE DOUGHNUT CHART
// ======================================

function updateAttendanceChart(data) {
    const canvas = document.getElementById("attendanceChart");

    if (!canvas || typeof Chart === "undefined") return;

    if (attendanceChart) {
        attendanceChart.destroy();
    }

    attendanceChart = new Chart(canvas, {
        type: "doughnut",

        data: {
            labels: ["Present", "Absent", "Unmarked"],

            datasets: [{
                data: [
                    data.present,
                    data.absent,
                    data.unmarked
                ],

                backgroundColor: [
                    "#75C9A3",
                    "#F28C83",
                    "#77718F"
                ],

                borderWidth: 0,
                hoverOffset: 10
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    position: "bottom",

                    labels: {
                        color: "#FFFFFF",
                        padding: 18
                    }
                }
            },

            cutout: "65%"
        }
    });
}


// ======================================
// WEEKLY ATTENDANCE CHART
// ======================================

async function loadWeeklyChart() {
    try {
        const data = await apiRequest(API.weekly);

        const canvas = document.getElementById("weeklyChart");

        if (!canvas || typeof Chart === "undefined") return;

        if (weeklyChart) {
            weeklyChart.destroy();
        }

        weeklyChart = new Chart(canvas, {
            type: "bar",

            data: {
                labels: data.map(item => item.date),

                datasets: [{
                    label: "Attendance Percentage",

                    data: data.map(item => item.percentage),

                    backgroundColor: "#F5B77E",
                    borderRadius: 8,
                    maxBarThickness: 45
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                scales: {
                    x: {
                        ticks: {
                            color: "#D0CEE0"
                        },
                        grid: {
                            display: false
                        }
                    },

                    y: {
                        beginAtZero: true,
                        max: 100,

                        ticks: {
                            color: "#D0CEE0",
                            callback: value => value + "%"
                        },

                        grid: {
                            color: "rgba(255,255,255,0.08)"
                        }
                    }
                },

                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

    } catch (error) {
        console.error("Weekly chart error:", error);
    }
}


// ======================================
// COMPLETE DASHBOARD
// ======================================

async function loadDashboard() {
    await loadSummary();
    await loadWeeklyChart();
}


// ======================================
// ADD STUDENT
// ======================================

document.getElementById("studentForm").addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const button = this.querySelector(
            'button[type="submit"]'
        );

        button.disabled = true;

        const studentData = {
            roll_no: document.getElementById("rollNo").value.trim(),

            name: document.getElementById("studentName").value.trim(),

            class_name: document.getElementById("className").value.trim()
        };

        try {
            const result = await apiRequest(API.students, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(studentData)
            });

            showMessage(
                "studentMessage",
                result.message,
                true
            );

            this.reset();

            await loadStudents();
            await loadDashboard();

        } catch (error) {
            showMessage(
                "studentMessage",
                error.message,
                false
            );

        } finally {
            button.disabled = false;
        }
    }
);


// ======================================
// LOAD STUDENTS
// ======================================

async function loadStudents() {
    const table = document.getElementById("studentTable");

    try {
        const students = await apiRequest(API.students);

        table.innerHTML = "";

        if (students.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="4">No students registered yet.</td>
                </tr>
            `;
            return;
        }

        students.forEach(student => {
            const row = document.createElement("tr");

            const rollCell = document.createElement("td");
            rollCell.textContent = student.roll_no;

            const nameCell = document.createElement("td");
            nameCell.textContent = student.name;

            const classCell = document.createElement("td");
            classCell.textContent = student.class_name;

            const actionCell = document.createElement("td");

            const deleteButton = document.createElement("button");

            deleteButton.className = "small-btn delete-btn";
            deleteButton.textContent = "Delete";

            deleteButton.addEventListener("click", () => {
                deleteStudent(student.id);
            });

            actionCell.appendChild(deleteButton);

            row.append(
                rollCell,
                nameCell,
                classCell,
                actionCell
            );

            table.appendChild(row);
        });

        filterStudents();

    } catch (error) {
        table.innerHTML = `
            <tr>
                <td colspan="4">Unable to load students.</td>
            </tr>
        `;

        console.error(error);
    }
}


// ======================================
// SEARCH STUDENTS
// ======================================

function filterStudents() {
    const search = document.getElementById(
        "studentSearch"
    ).value.toLowerCase();

    document.querySelectorAll("#studentTable tr").forEach(row => {
        row.style.display = row.textContent
            .toLowerCase()
            .includes(search) ? "" : "none";
    });
}

document.getElementById("studentSearch").addEventListener(
    "input",
    filterStudents
);


// ======================================
// DELETE STUDENT
// ======================================

async function deleteStudent(studentId) {
    const confirmed = confirm(
        "Are you sure you want to delete this student?"
    );

    if (!confirmed) return;

    try {
        const result = await apiRequest(
            `/api/students/${studentId}`,
            {
                method: "DELETE"
            }
        );

        alert(result.message);

        await loadStudents();
        await loadDashboard();
        await loadAttendance();

    } catch (error) {
        alert(error.message);
    }
}


// ======================================
// LOAD ATTENDANCE TABLE
// ======================================

async function loadAttendance() {
    const table = document.getElementById("attendanceTable");

    try {
        const students = await apiRequest(API.attendance);

        table.innerHTML = "";

        if (students.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="5">No registered students.</td>
                </tr>
            `;
            return;
        }

        students.forEach(student => {
            const row = document.createElement("tr");

            const roll = document.createElement("td");
            roll.textContent = student.roll_no;

            const name = document.createElement("td");
            name.textContent = student.name;

            const classCell = document.createElement("td");
            classCell.textContent = student.class_name;

            const status = document.createElement("td");
            status.textContent = student.status || "Unmarked";

            const action = document.createElement("td");
            action.className = "table-action";

            const presentButton = document.createElement("button");
            presentButton.className = "small-btn present-btn";
            presentButton.textContent = "Present";

            presentButton.addEventListener("click", () => {
                markAttendance(student.student_id, "Present");
            });

            const absentButton = document.createElement("button");
            absentButton.className = "small-btn absent-btn";
            absentButton.textContent = "Absent";

            absentButton.addEventListener("click", () => {
                markAttendance(student.student_id, "Absent");
            });

            action.append(
                presentButton,
                absentButton
            );

            row.append(
                roll,
                name,
                classCell,
                status,
                action
            );

            table.appendChild(row);
        });

    } catch (error) {
        table.innerHTML = `
            <tr>
                <td colspan="5">Unable to load attendance.</td>
            </tr>
        `;

        console.error(error);
    }
}


// ======================================
// MARK PRESENT OR ABSENT
// ======================================

async function markAttendance(studentId, status) {
    try {
        const result = await apiRequest(API.attendance, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                student_id: studentId,
                status: status
            })
        });

        alert(result.message);

        await loadAttendance();
        await loadDashboard();

    } catch (error) {
        alert(error.message);
    }
}


// ======================================
// REFRESH ATTENDANCE
// ======================================

document.getElementById("refreshAttendance").addEventListener(
    "click",
    loadAttendance
);


// ======================================
// GENERATE QR CODE
// ======================================

async function generateQRCode() {
    const button = document.getElementById("generateQR");

    const message = document.getElementById("qrMessage");

    button.disabled = true;
    button.innerHTML = "Generating QR Code...";

    message.textContent = "";

    try {
        const result = await apiRequest(API.generateQR, {
            method: "POST"
        });

        currentQR = result.qr_image;
        currentQRLink = result.scan_url;

        const image = document.getElementById("qrImage");

        image.src = currentQR;
        image.hidden = false;

        document.getElementById("qrPlaceholder").hidden = true;

        document.getElementById("qrLink").textContent =
            currentQRLink;

        document.getElementById("downloadQR").disabled = false;
        document.getElementById("copyQRLink").disabled = false;

        showMessage(
            "qrMessage",
            "QR code generated successfully!",
            true
        );

    } catch (error) {
        showMessage(
            "qrMessage",
            error.message,
            false
        );

    } finally {
        button.disabled = false;

        button.innerHTML =
            '<i class="bi bi-magic"></i> Generate QR Code';
    }
}

document.getElementById("generateQR").addEventListener(
    "click",
    generateQRCode
);


// ======================================
// QUICK QR BUTTON
// ======================================

document.getElementById("quickQR").addEventListener(
    "click",
    () => {
        openPage("qr");
        generateQRCode();
    }
);


// ======================================
// DOWNLOAD QR CODE
// ======================================

document.getElementById("downloadQR").addEventListener(
    "click",
    () => {
        if (!currentQR) return;

        const link = document.createElement("a");

        link.href = currentQR;
        link.download = "smart_attendance_qr.png";

        document.body.appendChild(link);
        link.click();
        link.remove();
    }
);


// ======================================
// COPY QR ATTENDANCE LINK
// ======================================

document.getElementById("copyQRLink").addEventListener(
    "click",
    async () => {
        if (!currentQRLink) return;

        try {
            await navigator.clipboard.writeText(currentQRLink);

            showMessage(
                "qrMessage",
                "Attendance link copied successfully!",
                true
            );

        } catch (error) {
            showMessage(
                "qrMessage",
                "Unable to copy. Please copy the link manually.",
                false
            );
        }
    }
);


// ======================================
// INITIALIZE APPLICATION
// ======================================

document.addEventListener("DOMContentLoaded", () => {
    displayDate();

    loadDashboard();
    loadStudents();
    loadAttendance();
});

