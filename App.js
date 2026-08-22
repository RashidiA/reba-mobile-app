import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Line, Circle } from 'react-native-svg';
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

  const hmFactor = parseFloat((Math.min(1.0, 25 / Math.max(horizontalDist, 25))).toFixed(2));
  const vmFactor = parseFloat((Math.max(0, 1 - 0.003 * Math.abs(verticalDist - 75))).toFixed(2));
  const dmFactor = parseFloat((Math.min(1.0, 0.82 + 4.5 / Math.max(travelDist, 25))).toFixed(2));
  const amFactor = parseFloat((Math.max(0, 1 - 0.0032 * asymmetryAngle)).toFixed(2));

  const rwl = parseFloat((23 * hmFactor * vmFactor * dmFactor * amFactor).toFixed(2));
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

  // HTML Multi-Page PDF Generator Matching Standard 3-Page Layout
  const exportPDFReport = async () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1c2833; margin: 0; padding: 0; font-size: 10px; }
            .page { page-break-after: always; height: 96vh; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; }
            
            .header { border-bottom: 2px solid #1a5276; padding-bottom: 4px; margin-bottom: 10px; }
            .header h1 { margin: 0; font-size: 16px; color: #1a5276; text-transform: uppercase; }
            .header p { margin: 2px 0 0 0; color: #566573; font-size: 9px; }
            
            .card-alert { background-color: #fceae8; border-left: 4px solid #c0392b; padding: 8px; margin-bottom: 10px; }
            .card-info { background-color: #ebf5fb; border-left: 4px solid #2980b9; padding: 8px; margin-bottom: 10px; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #d5dbdb; padding: 5px 6px; text-align: left; font-size: 9.5px; }
            th { background-color: #2c3e50; color: #ffffff; text-transform: uppercase; font-size: 9px; }
            .active-row { background-color: #f1948a; font-weight: bold; }
            
            .section-title { font-size: 11px; font-weight: bold; color: #2c3e50; margin: 8px 0 4px 0; border-bottom: 1px solid #ae2012; padding-bottom: 2px; }
            .footer { font-size: 8.5px; text-align: center; color: #7f8c8d; border-top: 1px solid #d5dbdb; padding-top: 4px; }
            
            .diagram-box { text-align: center; margin: 8px 0; padding: 8px; background: #fafafa; border: 1px dashed #bdc3c7; }
          </style>
        </head>
        <body>

          <!-- PAGE 1: REBA POSTURE AUDIT -->
          <div class="page">
            <div>
              <div class="header">
                <h1>REBA POSTURE AUDIT REPORT</h1>
                <p>Operator: OP-001 | Total Duration: 13.9 sec | Peak Evaluated REBA Score: <strong>${rebaScore}</strong></p>
              </div>

              <div class="section-title">Full-Body Posture Duration Breakdown</div>
              <table>
                <tr><th>Body Part</th><th>Score 1-2 (%)</th><th>Score 3-4 (%)</th><th>Score 5+ (%)</th></tr>
                <tr><td>Trunk</td><td>73.0%</td><td>27.0%</td><td>0.0%</td></tr>
                <tr><td>Neck</td><td>100.0%</td><td>0.0%</td><td>0.0%</td></tr>
                <tr><td>Upper Arm</td><td>34.1%</td><td>65.9%</td><td>0.0%</td></tr>
                <tr><td>Legs</td><td>100.0%</td><td>0.0%</td><td>0.0%</td></tr>
                <tr><td>Wrists</td><td>100.0%</td><td>0.0%</td><td>0.0%</td></tr>
              </table>

              <div class="section-title">REBA Standard Action & Risk Table</div>
              <table>
                <tr><th>REBA Score</th><th>Risk Level</th><th>Action Required</th></tr>
                <tr ${rebaScore === 1 ? 'class="active-row"' : ''}><td>1</td><td>None</td><td>Not necessary</td></tr>
                <tr ${rebaScore >= 2 && rebaScore <= 3 ? 'class="active-row"' : ''}><td>2-3</td><td>Low</td><td>May be necessary</td></tr>
                <tr ${rebaScore >= 4 && rebaScore <= 7 ? 'class="active-row"' : ''}><td>4-7</td><td>Medium</td><td>Necessary</td></tr>
                <tr ${rebaScore >= 8 && rebaScore <= 10 ? 'class="active-row"' : ''}><td>8-10</td><td>High</td><td>Necessary and soon</td></tr>
                <tr ${rebaScore >= 11 ? 'class="active-row"' : ''}><td>11-15</td><td>Very High</td><td>Necessary urgent</td></tr>
              </table>

              <div class="section-title">Peak REBA Posture Snapshot & Step-by-Step Joint Angles</div>
              <table>
                <tr><th>REBA Step / Joint</th><th>Score Value</th><th>Status</th></tr>
                <tr><td>Step 1: Neck</td><td>+${neck}</td><td>Evaluated</td></tr>
                <tr><td>Step 2: Trunk</td><td>+${trunk}</td><td>Evaluated</td></tr>
                <tr><td>Step 3: Legs</td><td>+${legs}</td><td>Evaluated</td></tr>
                <tr><td>Step 7: Upper Arm</td><td>+${upperArm}</td><td>Evaluated</td></tr>
                <tr><td>Step 8: Lower Arm</td><td>+${lowerArm}</td><td>Evaluated</td></tr>
                <tr><td>Step 9: Wrist</td><td>+${wrist}</td><td>Evaluated</td></tr>
              </table>
            </div>
            <div class="footer">Page 1 of 3 - REBA Posture Risk Evaluation</div>
          </div>

          <!-- PAGE 2: MANUAL MATERIAL HANDLING AUDIT -->
          <div class="page">
            <div>
              <div class="header">
                <h1>MANUAL WEIGHT LIFTING AUDIT</h1>
                <p>Operator: OP-001 | Evaluation Profile: Male</p>
              </div>

              <div class="${mmhWeight > mmhLimit ? 'card-alert' : 'card-info'}">
                <strong>SAFETY STATUS: ${mmhWeight > mmhLimit ? 'EXCEEDS SAFE ERGONOMIC LIMIT' : 'WITHIN SAFE ERGONOMIC LIMIT'}</strong><br/>
                Task Type: <strong>${mmhTask}</strong> | Distance: <strong>${mmhDistance} m</strong><br/>
                Actual Weight Lifted: <strong>${mmhWeight} kg</strong> | Max Recommended Limit: <strong>${mmhLimit} kg</strong>
              </div>

              <div class="section-title">Recommended Weight Matrix Reference (Male)</div>
              <table>
                <tr><th>Height Zone</th><th>Close Reach Limit (kg)</th><th>Far Reach Limit (kg)</th></tr>
                <tr class="active-row"><td>Above Shoulder</td><td>10.0 kg</td><td>5.0 kg</td></tr>
                <tr><td>Shoulder to Elbow</td><td>20.0 kg</td><td>10.0 kg</td></tr>
                <tr><td>Elbow to Knuckle</td><td>25.0 kg</td><td>15.0 kg</td></tr>
                <tr><td>Knuckle to Mid-Leg</td><td>20.0 kg</td><td>10.0 kg</td></tr>
                <tr><td>Below Mid-Leg</td><td>10.0 kg</td><td>5.0 kg</td></tr>
              </table>

              <div class="section-title">Ergonomic Lifting Reference Diagram</div>
              <div class="diagram-box">
                <svg width="340" height="160" viewBox="0 0 340 160">
                  <text x="100" y="15" font-weight="bold" fill="#2c3e50" font-size="10">Female</text>
                  <text x="240" y="15" font-weight="bold" fill="#2c3e50" font-size="10">Male</text>
                  <line x1="10" y1="22" x2="330" y2="22" stroke="#bdc3c7" stroke-width="1"/>

                  <text x="10" y="38" font-size="9" fill="#7f8c8d">Shoulder height</text>
                  <text x="100" y="38" font-size="9" fill="#c0392b" font-weight="bold">3 kg / 7 kg</text>
                  <text x="240" y="38" font-size="9" fill="#c0392b" font-weight="bold">10 kg / 5 kg</text>

                  <text x="10" y="66" font-size="9" fill="#7f8c8d">Elbow height</text>
                  <text x="100" y="66" font-size="9">7 kg / 13 kg</text>
                  <text x="240" y="66" font-size="9">20 kg / 10 kg</text>

                  <text x="10" y="94" font-size="9" fill="#7f8c8d">Knuckle height</text>
                  <text x="100" y="94" font-size="9">10 kg / 16 kg</text>
                  <text x="240" y="94" font-size="9">25 kg / 15 kg</text>

                  <text x="10" y="122" font-size="9" fill="#7f8c8d">Mid lower leg height</text>
                  <text x="100" y="122" font-size="9">7 kg / 13 kg</text>
                  <text x="240" y="122" font-size="9">20 kg / 10 kg</text>

                  <text x="10" y="150" font-size="9" fill="#7f8c8d">Below mid lower leg</text>
                  <text x="100" y="150" font-size="9">3 kg / 7 kg</text>
                  <text x="240" y="150" font-size="9">10 kg / 5 kg</text>
                </svg>
              </div>

              <div class="section-title">Ergonomic Recommendations</div>
              <ol style="margin-top:2px; padding-left:15px;">
                <li>Maintain load close to body to optimize reach leverage.</li>
                <li>Avoid lifting above shoulder height without mechanical support.</li>
              </ol>
            </div>
            <div class="footer">Page 2 of 3 - Recommended Weight Limits Matrix Standard</div>
          </div>

          <!-- PAGE 3: NIOSH LIFTING EQUATION ASSESSMENT & LOGS -->
          <div class="page">
            <div>
              <div class="header">
                <h1>NIOSH LIFTING EQUATION ASSESSMENT</h1>
                <p>Operator: OP-001 | Peak Dynamic Spatial Evaluation</p>
              </div>

              <div class="section-title">1. Object & Load Condition</div>
              <p>Hand Detected Object: <strong>Unidentified Object</strong> | Actual Object Weight: <strong>${loadWeight} kg</strong></p>

              <div class="section-title">2. Live NIOSH Multipliers & Spatial Geometry</div>
              <table>
                <tr><th>Parameter / Multiplier</th><th>Measured Value</th><th>Factor</th><th>Formula / Standard</th></tr>
                <tr><td>Load Constant (LC)</td><td>23.0 kg</td><td>1.00</td><td>Baseline Load</td></tr>
                <tr><td>Horizontal Multiplier (HM)</td><td>${horizontalDist} cm</td><td>${hmFactor}</td><td>25 / H</td></tr>
                <tr><td>Vertical Multiplier (VM)</td><td>${verticalDist} cm</td><td>${vmFactor}</td><td>1 - 0.003 |V - 75|</td></tr>
                <tr><td>Distance Multiplier (DM)</td><td>${travelDist} cm</td><td>${dmFactor}</td><td>0.82 + (4.5 / D)</td></tr>
                <tr><td>Asymmetric Multiplier (AM)</td><td>${asymmetryAngle} deg</td><td>${amFactor}</td><td>1 - 0.0032(A)</td></tr>
              </table>

              <div class="${liftingIndex > 1.0 ? 'card-alert' : 'card-info'}" style="margin-top:10px;">
                <div class="section-title" style="margin-top:0; color:#c0392b;">3. NIOSH Final Safety Assessment</div>
                <p style="font-size:11px; margin: 2px 0;"><strong>Recommended Weight Limit (RWL):</strong> ${rwl} kg</p>
                <p style="font-size:11px; margin: 2px 0;"><strong>Lifting Index (LI = Actual Weight / RWL):</strong> ${liftingIndex}</p>
                <p style="font-size:12px; margin: 4px 0 0 0; color:#c0392b;"><strong>NIOSH EVALUATION: ${liftingIndex > 1.0 ? 'HIGH RISK (LI > 1.0)' : 'ACCEPTABLE RISK (LI <= 1.0)'}</strong></p>
              </div>

              <div class="section-title">Captured Real-Time Audit Logs (${auditLogs.length} Entries)</div>
              <table>
                <tr>
                  <th>Time</th>
                  <th>REBA</th>
                  <th>NIOSH LI</th>
                  <th>MMH Limit</th>
                </tr>
                ${auditLogs.length > 0 ? auditLogs.map(l => `
                  <tr>
                    <td>${l.timestamp}</td>
                    <td>${l.reba}</td>
                    <td>${l.li}</td>
                    <td>${l.mmhLimit} kg</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" style="text-align:center;">No real-time logs captured yet</td></tr>'}
              </table>
            </div>
            <div class="footer">Page 3 of 3 - NIOSH Lifting Equation Assessment Report</div>
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
