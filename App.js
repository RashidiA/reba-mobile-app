import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Line, Circle } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

const { width, height } = Dimensions.get('window');

// --- REBA LOOKUP TABLES ---
const TABLE_A = {
  '1-1-1': 1, '1-1-2': 2, '1-2-1': 2, '1-2-2': 3,
  '2-1-1': 2, '2-1-2': 3, '2-2-1': 3, '2-2-2': 4,
  '3-1-1': 3, '3-1-2': 4, '3-2-1': 4, '3-2-2': 5,
  '4-1-1': 4, '4-1-2': 5, '4-2-1': 5, '4-2-2': 6,
  '5-1-1': 6, '5-1-2': 7, '5-2-1': 7, '5-2-2': 8,
};

const TABLE_B = {
  '1-1-1': 1, '1-1-2': 2, '1-2-1': 2, '1-2-2': 3,
  '2-1-1': 1, '2-1-2': 2, '2-2-1': 3, '2-2-2': 4,
  '3-1-1': 3, '3-1-2': 4, '3-2-1': 4, '3-2-2': 5,
  '4-1-1': 4, '4-1-2': 5, '4-2-1': 5, '4-2-2': 6,
  '5-1-1': 7, '5-1-2': 8, '5-2-1': 8, '5-2-2': 9,
};

const TABLE_C = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 10],
  [5, 5, 5, 6, 7, 8, 8, 9, 9, 10, 10, 11],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  [7, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12],
  [7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12],
  [8, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 12],
  [9, 9, 9, 10, 10, 11, 11, 12, 12, 12, 12, 12],
  [10, 10, 10, 11, 11, 12, 12, 12, 12, 12, 12, 12]
];

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState('REBA');

  // --- REBA Parameters ---
  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);
  const [legs, setLegs] = useState(1);
  const [upperArm, setUpperArm] = useState(1);
  const [lowerArm, setLowerArm] = useState(1);
  const [wrist, setWrist] = useState(1);

  // --- NIOSH Lifting Parameters ---
  const [loadWeight, setLoadWeight] = useState(10);
  const [horizontalDist, setHorizontalDist] = useState(30);
  const [verticalDist, setVerticalDist] = useState(75);
  const [travelDist, setTravelDist] = useState(25);
  const [asymmetryAngle, setAsymmetryAngle] = useState(0);

  // --- MMH Parameters ---
  const [mmhTask, setMmhTask] = useState('Carry');
  const [mmhWeight, setMmhWeight] = useState(15);
  const [mmhDistance, setMmhDistance] = useState(10);

  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  // Calculations
  const rebaScore = (() => {
    const keyA = `${trunk}-${neck}-${legs}`;
    const scoreA = TABLE_A[keyA] || 1;
    const keyB = `${upperArm}-${lowerArm}-${wrist}`;
    const scoreB = TABLE_B[keyB] || 1;
    const rowIdx = Math.min(Math.max(scoreA - 1, 0), 11);
    const colIdx = Math.min(Math.max(scoreB - 1, 0), 11);
    return TABLE_C[rowIdx][colIdx];
  })();

  const rwl = (() => {
    const LC = 23;
    const HM = Math.min(1.0, 25 / Math.max(horizontalDist, 25));
    const VM = 1 - 0.003 * Math.abs(verticalDist - 75);
    const DM = 0.82 + 4.5 / Math.max(travelDist, 25);
    const AM = 1 - 0.0032 * asymmetryAngle;
    return parseFloat((LC * HM * Math.max(0, VM) * Math.min(1.0, DM) * Math.max(0, AM)).toFixed(2));
  })();

  const liftingIndex = parseFloat((loadWeight / (rwl || 1)).toFixed(2));

  const mmhLimit = (() => {
    let base = mmhTask === 'Push' ? 20 : mmhTask === 'Pull' ? 18 : 14;
    return parseFloat(Math.max(5, base - (mmhDistance > 10 ? (mmhDistance - 10) * 0.2 : 0)).toFixed(1));
  })();

  const logAudit = () => {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      reba: rebaScore,
      rwl: rwl,
      li: liftingIndex,
      mmhTask: mmhTask,
      mmhWeight: mmhWeight,
      mmhLimit: mmhLimit,
    };
    setAuditLogs([entry, ...auditLogs]);
  };

  // HTML Multi-Page PDF Generator
  const exportPDFReport = async () => {
    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
            .page { page-break-after: always; height: 95vh; display: flex; flex-direction: column; justify-content: space-between; }
            h1 { color: #1E1E1E; border-bottom: 2px solid #00FF66; padding-bottom: 10px; }
            h2 { color: #2A2A2A; margin-top: 20px; }
            .card { background-color: #F4F4F4; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #DDD; padding: 8px; text-align: left; }
            th { background-color: #2A2A2A; color: white; }
            .footer { font-size: 10px; text-align: center; color: #888; border-top: 1px solid #CCC; padding-top: 5px; }
          </style>
        </head>
        <body>
          <!-- PAGE 1: REBA Posture Assessment -->
          <div class="page">
            <div>
              <h1>Ergonomic Audit Report: Page 1 / 3</h1>
              <h2>REBA Postural Evaluation</h2>
              <div class="card">
                <p><strong>Calculated REBA Score:</strong> ${rebaScore}</p>
                <p><strong>Action Level:</strong> ${rebaScore > 7 ? 'High Risk - Corrective Action Required' : 'Low/Medium Risk'}</p>
              </div>
              <h3>Posture Parameters</h3>
              <ul>
                <li>Trunk Score: ${trunk}</li>
                <li>Neck Score: ${neck}</li>
                <li>Legs Score: ${legs}</li>
                <li>Upper Arm: ${upperArm} | Lower Arm: ${lowerArm} | Wrist: ${wrist}</li>
              </ul>
            </div>
            <div class="footer">REBA Assessment Section - Generated Mobile Ergonomic Report</div>
          </div>

          <!-- PAGE 2: NIOSH Lifting Assessment -->
          <div class="page">
            <div>
              <h1>Ergonomic Audit Report: Page 2 / 3</h1>
              <h2>NIOSH Lifting Equation Analysis</h2>
              <div class="card">
                <p><strong>Recommended Weight Limit (RWL):</strong> ${rwl} kg</p>
                <p><strong>Lifting Index (LI):</strong> ${liftingIndex}</p>
                <p><strong>Evaluation:</strong> ${liftingIndex > 1.0 ? 'Exceeds Recommended Safe Limit' : 'Acceptable Lift Criteria'}</p>
              </div>
              <h3>Input Variables</h3>
              <ul>
                <li>Actual Load Weight: ${loadWeight} kg</li>
                <li>Horizontal Distance: ${horizontalDist} cm</li>
                <li>Vertical Distance: ${verticalDist} cm</li>
                <li>Travel Distance: ${travelDist} cm</li>
              </ul>
            </div>
            <div class="footer">NIOSH Section - Generated Mobile Ergonomic Report</div>
          </div>

          <!-- PAGE 3: MMH Snook Assessment & Summary Logs -->
          <div class="page">
            <div>
              <h1>Ergonomic Audit Report: Page 3 / 3</h1>
              <h2>Manual Materials Handling (MMH) & Audit Log Summary</h2>
              <div class="card">
                <p><strong>Task Type:</strong> ${mmhTask}</p>
                <p><strong>Handled Load Weight:</strong> ${mmhWeight} kg</p>
                <p><strong>Maximum Recommended Limit:</strong> ${mmhLimit} kg</p>
              </div>
              <h3>Captured Real-Time Logs (${auditLogs.length} Entries)</h3>
              <table>
                <tr>
                  <th>Time</th>
                  <th>REBA</th>
                  <th>NIOSH LI</th>
                  <th>MMH Limit</th>
                </tr>
                ${auditLogs.map(l => `
                  <tr>
                    <td>${l.timestamp}</td>
                    <td>${l.reba}</td>
                    <td>${l.li}</td>
                    <td>${l.mmhLimit} kg</td>
                  </tr>
                `).join('')}
              </table>
            </div>
            <div class="footer">MMH Summary Section - Generated Mobile Ergonomic Report</div>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (err) {
      Alert.alert('Error', 'Failed to generate PDF report.');
    }
  };

  if (!permission || !permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.messageText}>Camera access required.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live Camera View */}
      <CameraView style={styles.camera} facing="back">
        <Svg height={height * 0.35} width={width} style={styles.overlay}>
          <Line x1={width * 0.5} y1="40" x2={width * 0.5} y2="180" stroke="#00FF66" strokeWidth="4" />
          <Circle cx={width * 0.5} cy="30" r="12" stroke="#00FF66" strokeWidth="3" fill="transparent" />
        </Svg>
      </CameraView>

      {/* Control Dashboard */}
      <View style={styles.dashboard}>
        {/* Toggle Mode */}
        <View style={styles.modeToggle}>
          <TouchableOpacity style={[styles.toggleBtn, mode === 'REBA' && styles.toggleActive]} onPress={() => setMode('REBA')}>
            <Text style={styles.toggleText}>REBA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, mode === 'NIOSH' && styles.toggleActive]} onPress={() => setMode('NIOSH')}>
            <Text style={styles.toggleText}>NIOSH</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, mode === 'MMH' && styles.toggleActive]} onPress={() => setMode('MMH')}>
            <Text style={styles.toggleText}>MMH</Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Display Panel */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>REBA SCORE</Text>
            <Text style={styles.scoreVal}>{rebaScore}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>NIOSH LI</Text>
            <Text style={styles.scoreVal}>{liftingIndex}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>MMH LIMIT</Text>
            <Text style={styles.scoreVal}>{mmhLimit} kg</Text>
          </View>
        </View>

        {/* Dynamic Adjustment Panel */}
        <ScrollView style={styles.controlsScroll}>
          {mode === 'REBA' && (
            <View style={styles.adjRow}>
              <Text style={styles.adjLabel}>Trunk Angle Score ({trunk}):</Text>
              <TouchableOpacity onPress={() => setTrunk(Math.max(1, trunk - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setTrunk(Math.min(5, trunk + 1))} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
            </View>
          )}

          {mode === 'NIOSH' && (
            <View style={styles.adjRow}>
              <Text style={styles.adjLabel}>Load Weight ({loadWeight} kg):</Text>
              <TouchableOpacity onPress={() => setLoadWeight(Math.max(1, loadWeight - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setLoadWeight(loadWeight + 1)} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
            </View>
          )}

          {mode === 'MMH' && (
            <View style={styles.adjRow}>
              <Text style={styles.adjLabel}>Handled Weight ({mmhWeight} kg):</Text>
              <TouchableOpacity onPress={() => setMmhWeight(Math.max(1, mmhWeight - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setMmhWeight(mmhWeight + 1)} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Action Controls */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={logAudit}>
            <Text style={styles.btnText}>Log Entry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF9900' }]} onPress={exportPDFReport}>
            <Text style={styles.btnText}>Export 3-Page PDF</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#121212' },
  messageText: { color: '#FFF', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: '#00FF66', padding: 12, borderRadius: 8 },
  buttonText: { color: '#121212', fontWeight: 'bold' },
  camera: { height: height * 0.35, width: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0 },
  dashboard: { flex: 1, backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modeToggle: { flexDirection: 'row', backgroundColor: '#2A2A2A', borderRadius: 8, marginBottom: 12 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: '#00FF66' },
  toggleText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  scoreBox: { backgroundColor: '#2A2A2A', flex: 1, marginHorizontal: 3, padding: 8, borderRadius: 8, alignItems: 'center' },
  scoreLabel: { color: '#888', fontSize: 9, fontWeight: 'bold' },
  scoreVal: { fontSize: 16, fontWeight: 'bold', color: '#FFF', marginTop: 4 },
  controlsScroll: { flex: 1, marginBottom: 10 },
  adjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, backgroundColor: '#2A2A2A', padding: 8, borderRadius: 6 },
  adjLabel: { color: '#FFF', fontSize: 12 },
  adjBtn: { backgroundColor: '#3A3A3A', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  adjText: { color: '#00FF66', fontSize: 18, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 1, backgroundColor: '#00FF66', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  btnText: { color: '#121212', fontWeight: 'bold' }
});
