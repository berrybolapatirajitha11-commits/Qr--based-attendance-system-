
from flask import Flask, render_template, request, jsonify, Response
import sqlite3
import qrcode
import io
import base64
import csv
import uuid
from datetime import date, datetime, timedelta

app = Flask(__name__)
DATABASE = "attendance.db"


# DATABASE CONNECTION
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# CREATE DATABASE TABLES
def init_db():
    conn = get_db()

    conn.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roll_no TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            class_name TEXT NOT NULL
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            attendance_date TEXT NOT NULL,
            status TEXT NOT NULL,
            UNIQUE(student_id, attendance_date),
            FOREIGN KEY(student_id) REFERENCES students(id)
        )
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


# HOME PAGE
@app.route("/")
def home():
    return render_template("index.html")


# STUDENT MANAGEMENT
@app.route("/api/students", methods=["GET", "POST"])
def students():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        roll = str(data.get("roll_no", "")).strip()
        name = str(data.get("name", "")).strip()
        class_name = str(data.get("class_name", "")).strip()

        if not roll or not name or not class_name:
            conn.close()
            return jsonify({"error": "Fill all fields"}), 400

        try:
            conn.execute(
                "INSERT INTO students (roll_no, name, class_name) VALUES (?, ?, ?)",
                (roll, name, class_name)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "Roll number already exists"}), 409

        conn.close()
        return jsonify({"message": "Student added successfully"})

    rows = conn.execute(
        "SELECT * FROM students ORDER BY id DESC"
    ).fetchall()

    conn.close()
    return jsonify([dict(row) for row in rows])


# DELETE STUDENT
@app.route("/api/students/<int:student_id>", methods=["DELETE"])
def delete_student(student_id):
    conn = get_db()

    conn.execute(
        "DELETE FROM attendance WHERE student_id = ?",
        (student_id,)
    )

    cursor = conn.execute(
        "DELETE FROM students WHERE id = ?",
        (student_id,)
    )

    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        return jsonify({"error": "Student not found"}), 404

    return jsonify({"message": "Student deleted successfully"})


# GENERATE REAL QR CODE
@app.route("/api/generate-qr", methods=["POST"])
def generate_qr():
    session_id = str(uuid.uuid4())

    conn = get_db()

    conn.execute(
        "INSERT INTO sessions (session_id, created_at) VALUES (?, ?)",
        (session_id, datetime.now().isoformat())
    )

    conn.commit()
    conn.close()

    scan_url = request.host_url.rstrip("/") + "/scan/" + session_id

    qr = qrcode.QRCode(
        version=None,
        box_size=10,
        border=4
    )

    qr.add_data(scan_url)
    qr.make(fit=True)

    image = qr.make_image(
        fill_color="black",
        back_color="white"
    )

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    encoded_image = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    return jsonify({
        "message": "QR code generated successfully",
        "session_id": session_id,
        "scan_url": scan_url,
        "qr_image": "data:image/png;base64," + encoded_image
    })


# QR ATTENDANCE PAGE
@app.route("/scan/<session_id>")
def scan_page(session_id):
    conn = get_db()

    session = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?",
        (session_id,)
    ).fetchone()

    conn.close()

    if not session:
        return "Invalid QR session", 404

    return render_template(
        "scan.html",
        session_id=session_id
    )


# MARK ATTENDANCE THROUGH QR
@app.route("/api/scan-attendance", methods=["POST"])
def scan_attendance():
    data = request.get_json(silent=True) or {}

    session_id = str(data.get("session_id", "")).strip()
    roll_no = str(data.get("roll_no", "")).strip()

    if not session_id or not roll_no:
        return jsonify({"error": "Enter roll number"}), 400

    conn = get_db()

    session = conn.execute(
        "SELECT * FROM sessions WHERE session_id = ?",
        (session_id,)
    ).fetchone()

    if not session:
        conn.close()
        return jsonify({"error": "Invalid QR session"}), 404

    student = conn.execute(
        "SELECT * FROM students WHERE roll_no = ?",
        (roll_no,)
    ).fetchone()

    if not student:
        conn.close()
        return jsonify({"error": "Student not registered"}), 404

    today = date.today().isoformat()

    conn.execute("""
        INSERT INTO attendance
        (student_id, attendance_date, status)
        VALUES (?, ?, 'Present')
        ON CONFLICT(student_id, attendance_date)
        DO UPDATE SET status = 'Present'
    """, (student["id"], today))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Attendance marked successfully",
        "student": student["name"],
        "roll_no": student["roll_no"]
    })


# ATTENDANCE MANAGEMENT
@app.route("/api/attendance", methods=["GET", "POST"])
def attendance():
    conn = get_db()

    if request.method == "POST":
        data = request.get_json(silent=True) or {}

        try:
            student_id = int(data.get("student_id"))
        except (TypeError, ValueError):
            conn.close()
            return jsonify({"error": "Invalid student ID"}), 400

        status = str(data.get("status", "")).strip().title()

        if status not in ("Present", "Absent"):
            conn.close()
            return jsonify({"error": "Invalid status"}), 400

        student = conn.execute(
            "SELECT id FROM students WHERE id = ?",
            (student_id,)
        ).fetchone()

        if not student:
            conn.close()
            return jsonify({"error": "Student not found"}), 404

        today = date.today().isoformat()

        conn.execute("""
            INSERT INTO attendance
            (student_id, attendance_date, status)
            VALUES (?, ?, ?)
            ON CONFLICT(student_id, attendance_date)
            DO UPDATE SET status = excluded.status
        """, (student_id, today, status))

        conn.commit()
        conn.close()

        return jsonify({"message": "Attendance updated successfully"})

    today = date.today().isoformat()

    rows = conn.execute("""
        SELECT s.id AS student_id,
               s.roll_no,
               s.name,
               s.class_name,
               a.status
        FROM students s
        LEFT JOIN attendance a
        ON s.id = a.student_id
        AND a.attendance_date = ?
        ORDER BY s.name
    """, (today,)).fetchall()

    conn.close()

    return jsonify([dict(row) for row in rows])


# DASHBOARD SUMMARY
@app.route("/api/summary")
def summary():
    conn = get_db()
    today = date.today().isoformat()

    total = conn.execute(
        "SELECT COUNT(*) FROM students"
    ).fetchone()[0]

    present = conn.execute("""
        SELECT COUNT(*) FROM attendance
        WHERE attendance_date = ?
        AND status = 'Present'
    """, (today,)).fetchone()[0]

    absent = conn.execute("""
        SELECT COUNT(*) FROM attendance
        WHERE attendance_date = ?
        AND status = 'Absent'
    """, (today,)).fetchone()[0]

    conn.close()

    unmarked = total - present - absent

    percentage = (
        round((present / total) * 100, 1)
        if total else 0
    )

    return jsonify({
        "total": total,
        "present": present,
        "absent": absent,
        "unmarked": unmarked,
        "percentage": percentage
    })


# WEEKLY ATTENDANCE
@app.route("/api/weekly")
def weekly():
    conn = get_db()
    result = []

    total = conn.execute(
        "SELECT COUNT(*) FROM students"
    ).fetchone()[0]

    for i in range(6, -1, -1):
        day = date.today() - timedelta(days=i)
        day_string = day.isoformat()

        present = conn.execute("""
            SELECT COUNT(*) FROM attendance
            WHERE attendance_date = ?
            AND status = 'Present'
        """, (day_string,)).fetchone()[0]

        percentage = (
            round((present / total) * 100, 1)
            if total else 0
        )

        result.append({
            "date": day.strftime("%d %b"),
            "present": present,
            "percentage": percentage
        })

    conn.close()
    return jsonify(result)


# DOWNLOAD CSV REPORT
@app.route("/api/report")
def report():
    conn = get_db()

    rows = conn.execute("""
        SELECT s.roll_no,
               s.name,
               s.class_name,
               a.attendance_date,
               a.status
        FROM attendance a
        JOIN students s ON s.id = a.student_id
        ORDER BY a.attendance_date DESC
    """).fetchall()

    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Roll Number",
        "Student Name",
        "Class",
        "Date",
        "Status"
    ])

    for row in rows:
        writer.writerow([
            row["roll_no"],
            row["name"],
            row["class_name"],
            row["attendance_date"],
            row["status"]
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition":
            "attachment; filename=attendance_report.csv"
        }
    )


# START APPLICATION
if __name__ == "__main__":
    init_db()
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
