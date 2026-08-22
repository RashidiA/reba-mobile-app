import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Line, Circle } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

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
  const [mode, setMode] = useState('REBA'); // 'REBA', 'NIOSH', or 'MMH'

  // --- REBA Parameters ---
  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);
  const [legs, setLegs] = useState(1);
  const [upperArm, setUpperArm] = useState(1);
  const [lowerArm, setLowerArm] = useState(1);
  const [wrist, setWrist] = useState(1);

  // --- NIOSH Lifting Parameters ---
  const [loadWeight, setLoadWeight] = useState(10); // kg
  const [horizontalDist, setHorizontalDist] = useState(30); // cm
  const [verticalDist, setVerticalDist] = useState(75); // cm
  const [travelDist, setTravelDist] = useState(25); // cm
  const [asymmetryAngle, setAsymmetryAngle] = useState(0); // deg

  // --- MMH (Snook Tables / Push-Pull-Carry) Parameters ---
  const [mmhTask, setMmhTask] = useState('Carry'); // Carry, Push, Pull
  const [mmhWeight, setMmhWeight] = useState(15); // kg
  const [mmhDistance, setMmhDistance] = useState(10); // meters
  const [mmhFrequency, setMmhFrequency] = useState(1); // lifts/min

  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  // REBA Engine
  const computeReba = () => {
    const keyA = `${trunk}-${neck}-${legs}`;
    const scoreA = TABLE_A[keyA] || 1;
    const keyB = `${upperArm}-${lowerArm}-${wrist}`;
    const scoreB = TABLE_B[keyB] || 1;
    const rowIdx = Math.min(Math.max(scoreA - 1, 0), 11);
    const colIdx = Math.min(Math.max(scoreB - 1, 0), 11);
    return TABLE_C[rowIdx][colIdx];
  };

  // NIOSH Engine
  const computeNioshRWL = () => {
    const LC = 23;
    const HM = Math.min(1.0, 25 / Math.max(horizontalDist, 25));
    const VM = 1 - 0.003 * Math.abs(verticalDist - 75);
    const DM = 0.82 + 4.5 / Math.max(travelDist, 25);
    const AM = 1 - 0.0032 * asymmetryAngle;

    const rwl = LC * HM * Math.max(0, VM) * Math.min(1.0, DM) * Math.max(0, AM);
    return parseFloat(rwl.toFixed(2));
  };

  // MMH Engine (Snook Limit Approximation based on Task & Distance)
  const computeMmhLimit = () => {
    let baseLimit = 14; // Standard carry base threshold (kg)
    if (mmhTask === 'Push') baseLimit = 20;
    if (mmhTask === 'Pull') baseLimit = 18;

    const freqPenalty = mmhFrequency * 0.8;
    const distPenalty = mmhDistance > 10 ? (mmhDistance - 10) * 0.2 : 0;
    
    const maxRecommended = Math.max(5, baseLimit - freqPenalty - distPenalty);
    return parseFloat(maxRecommended.toFixed(1));
  };

  const rebaScore = computeReba();
  const rwl = computeNioshRWL();
  const liftingIndex = parseFloat((loadWeight / (rwl || 1)).toFixed(2));
  const mmhLimit = computeMmhLimit();
  const mmhExceeded = mmhWeight > mmhLimit;

  const logAudit = () => {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      mode: mode,
      reba: rebaScore,
      rwl: rwl,
      li: liftingIndex,
      mmhTask: mmhTask,
      mmhWeight: mmhWeight,
      mmhLimit: mmhLimit,
      status: mode === 'REBA' 
        ? (rebaScore > 7 ? 'High Risk' : 'Acceptable') 
        : mode === 'NIOSH' 
        ? (liftingIndex > 1.0 ? 'High Risk' : 'Safe Lift')
        : (mmhExceeded ? 'Exceeds Snook Limit' : 'Acceptable Load')
    };
    setAuditLogs([entry, ...auditLogs]);
  };

  const exportCSV = async () => {
    if (auditLogs.length === 0) {
      Alert.alert('No Data', 'Add audit entries before exporting.');
      return;
    }

    let csv = 'Timestamp,Method,REBA Score,NIOSH RWL (kg),NIOSH LI,MMH Task,MMH Weight (kg),MMH Limit (kg),Status\n';
    auditLogs.forEach((l) => {
      csv += `${l.timestamp},${l.mode},${l.reba},${l.rwl},${l.li},${l.mmhTask || 'N/A'},${l.mmhWeight || 'N/A'},${l.mmhLimit || 'N/A'},${l.status}\n`;
    });

    const fileUri = `${FileSystem.documentDirectory}ergonomic_audit_${Date.now()}.csv`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri);
    } catch (err) {
      Alert.alert('Error', 'Failed to export CSV file.');
    }
  };

  if (!permission || !permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.messageText}>Camera permission required for ergonomic audits.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live Camera View */}
      <CameraView style={styles.camera} facing="back">
        <Svg height={height * 0.38} width={width} style={styles.overlay}>
          <Line x1={width * 0.5} y1="40" x2={width * 0.5} y2="180" stroke="#00FF66" strokeWidth="4" />
          <Circle cx={width * 0.5} cy="30" r="12" stroke="#00FF66" strokeWidth="3" fill="transparent" />
        </Svg>
      </CameraView>

      {/* Control Dashboard */}
      <View style={styles.dashboard}>
        {/* Toggle Mode Bar */}
        <View style={styles.modeToggle}>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'REBA' && styles.toggleActive]} 
            onPress={() => setMode('REBA')}>
            <Text style={styles.toggleText}>REBA</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'NIOSH' && styles.toggleActive]} 
            onPress={() => setMode('NIOSH')}>
            <Text style={styles.toggleText}>NIOSH</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, mode === 'MMH' && styles.toggleActive]} 
            onPress={() => setMode('MMH')}>
            <Text style={styles.toggleText}>MMH</Text>
          </TouchableOpacity>
        </View>

        {/* Dynamic Score Panel */}
        {mode === 'REBA' && (
          <View style={styles.scoreRow}>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>REBA SCORE</Text>
              <Text style={[styles.scoreVal, { color: rebaScore > 7 ? '#FF3300' : '#00FF66' }]}>{rebaScore}</Text>
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>ACTION LEVEL</Text>
              <Text style={styles.scoreVal}>{rebaScore > 7 ? 'High Risk' : 'Low Risk'}</Text>
            </View>
          </View>
        )}

        {mode === 'NIOSH' && (
          <View style={styles.scoreRow}>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>RWL (KG)</Text>
              <Text style={styles.scoreVal}>{rwl}</Text>
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>LIFTING INDEX (LI)</Text>
              <Text style={[styles.scoreVal, { color: liftingIndex > 1.0 ? '#FF3300' : '#00FF66' }]}>{liftingIndex}</Text>
            </View>
          </View>
        )}

        {mode === 'MMH' && (
          <View style={styles.scoreRow}>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>MAX LIMIT (KG)</Text>
              <Text style={styles.scoreVal}>{mmhLimit}</Text>
            </View>
            <View style={styles.scoreBox}>
              <Text style={styles.scoreLabel}>SNOOK ASSESSMENT</Text>
              <Text style={[styles.scoreVal, { color: mmhExceeded ? '#FF3300' : '#00FF66' }]}>
                {mmhExceeded ? 'Exceeded' : 'Safe Load'}
              </Text>
            </View>
          </View>
        )}

        {/* Dynamic Interactive Controls */}
        <ScrollView style={styles.controlsScroll}>
          {mode === 'REBA' && (
            <>
              <View style={styles.adjRow}>
                <Text style={styles.adjLabel}>Trunk Position ({trunk}):</Text>
                <TouchableOpacity onPress={() => setTrunk(Math.max(1, trunk - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setTrunk(Math.min(5, trunk + 1))} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
              </View>
              <View style={styles.adjRow}>
                <Text style={styles.adjLabel}>Neck Position ({neck}):</Text>
                <TouchableOpacity onPress={() => setNeck(Math.max(1, neck - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setNeck(Math.min(2, neck + 1))} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
              </View>
            </>
          )}

          {mode === 'NIOSH' && (
            <>
              <View style={styles.adjRow}>
                <Text style={styles.adjLabel}>Load Weight ({loadWeight} kg):</Text>
                <TouchableOpacity onPress={() => setLoadWeight(Math.max(1, loadWeight - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setLoadWeight(loadWeight + 1)} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
              </View>
              <View style={styles.adjRow}>
                <Text style={styles.adjLabel}>Horizontal Dist ({horizontalDist} cm):</Text>
                <TouchableOpacity onPress={() => setHorizontalDist(Math.max(25, horizontalDist - 5))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setHorizontalDist(horizontalDist + 5)} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
              </View>
            </>
          )}

          {mode === 'MMH' && (
            <>
              <View style={styles.adjRow}>
                <Text style={styles.adjLabel}>Task Type ({mmhTask}):</Text>
                <TouchableOpacity onPress={() => setMmhTask(mmhTask === 'Carry' ? 'Push' : mmhTask === 'Push' ? 'Pull' : 'Carry')} style={[styles.adjBtn, { width: 60 }]}>
                  <Text style={[styles.adjText, { fontSize: 12 }]}>Switch</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.adjRow}>
                <Text style={styles.adjLabel}>Handled Weight ({mmhWeight} kg):</Text>
                <TouchableOpacity onPress={() => setMmhWeight(Math.max(1, mmhWeight - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setMmhWeight(mmhWeight + 1)} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
              </View>
              <View style={styles.adjRow}>
                <Text style={styles.adjLabel}>Carry/Move Dist ({mmhDistance} m):</Text>
                <TouchableOpacity onPress={() => setMmhDistance(Math.max(1, mmhDistance - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setMmhDistance(mmhDistance + 1)} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>

        {/* Action Controls */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={logAudit}>
            <Text style={styles.btnText}>Log Entry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#29B6F6' }]} onPress={exportCSV}>
            <Text style={styles.btnText}>Export CSV</Text>
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
  camera: { height: height * 0.38, width: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0 },
  dashboard: { flex: 1, backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  modeToggle: { flexDirection: 'row', backgroundColor: '#2A2A2A', borderRadius: 8, marginBottom: 12 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: '#00FF66' },
  toggleText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  scoreBox: { backgroundColor: '#2A2A2A', flex: 1, marginHorizontal: 4, padding: 10, borderRadius: 8, alignItems: 'center' },
  scoreLabel: { color: '#888', fontSize: 10, fontWeight: 'bold' },
  scoreVal: { fontSize: 18, fontWeight: 'bold', color: '#FFF', marginTop: 4 },
  controlsScroll: { flex: 1, marginBottom: 10 },
  adjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, backgroundColor: '#2A2A2A', padding: 8, borderRadius: 6 },
  adjLabel: { color: '#FFF', fontSize: 12 },
  adjBtn: { backgroundColor: '#3A3A3A', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  adjText: { color: '#00FF66', fontSize: 18, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 1, backgroundColor: '#00FF66', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  btnText: { color: '#121212', fontWeight: 'bold' }
});
