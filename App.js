import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Line, Circle } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const { width, height } = Dimensions.get('window');

// REBA Reference Tables
const TABLE_A = {
  // [Trunk][Neck][Legs] -> Score
  '1-1-1': 1, '1-1-2': 2, '1-2-1': 2, '1-2-2': 3,
  '2-1-1': 2, '2-1-2': 3, '2-2-1': 3, '2-2-2': 4,
  '3-1-1': 3, '3-1-2': 4, '3-2-1': 4, '3-2-2': 5,
  '4-1-1': 4, '4-1-2': 5, '4-2-1': 5, '4-2-2': 6,
  '5-1-1': 6, '5-1-2': 7, '5-2-1': 7, '5-2-2': 8,
};

const TABLE_B = {
  // [UpperArm][LowerArm][Wrist] -> Score
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
  
  // Posture Parameters
  const [trunkScore, setTrunkScore] = useState(1);
  const [neckScore, setNeckScore] = useState(1);
  const [legScore, setLegScore] = useState(1);
  const [upperArmScore, setUpperArmScore] = useState(1);
  const [lowerArmScore, setLowerArmScore] = useState(1);
  const [wristScore, setWristScore] = useState(1);
  const [loadScore, setLoadScore] = useState(0);
  const [couplingScore, setCouplingScore] = useState(0);
  const [activityScore, setActivityScore] = useState(0);

  const [auditLogs, setAuditLogs] = useState([]);

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  // Compute REBA Engine Scores
  const computeReba = () => {
    const keyA = `${trunkScore}-${neckScore}-${legScore}`;
    const scoreA = (TABLE_A[keyA] || 1) + loadScore;

    const keyB = `${upperArmScore}-${lowerArmScore}-${wristScore}`;
    const scoreB = (TABLE_B[keyB] || 1) + couplingScore;

    const rowIdx = Math.min(Math.max(scoreA - 1, 0), 11);
    const colIdx = Math.min(Math.max(scoreB - 1, 0), 11);
    const scoreC = TABLE_C[rowIdx][colIdx];

    return scoreC + activityScore;
  };

  const finalRebaScore = computeReba();

  const getRiskCategory = (score) => {
    if (score === 1) return { level: 'Negligible', color: '#00FF66' };
    if (score <= 3) return { level: 'Low Risk', color: '#FFD700' };
    if (score <= 7) return { level: 'Medium Risk', color: '#FF9900' };
    if (score <= 10) return { level: 'High Risk', color: '#FF3300' };
    return { level: 'Very High Risk', color: '#FF0055' };
  };

  const currentRisk = getRiskCategory(finalRebaScore);

  const logAudit = () => {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      reba: finalRebaScore,
      risk: currentRisk.level,
      trunk: trunkScore,
      neck: neckScore,
      legs: legScore,
    };
    setAuditLogs([entry, ...auditLogs]);
  };

  const exportCSV = async () => {
    if (auditLogs.length === 0) {
      Alert.alert('No Data', 'Add audit entries before exporting.');
      return;
    }

    let csv = 'Timestamp,REBA Score,Risk Level,Trunk,Neck,Legs\n';
    auditLogs.forEach((l) => {
      csv += `${l.timestamp},${l.reba},${l.risk},${l.trunk},${l.neck},${l.legs}\n`;
    });

    const fileUri = `${FileSystem.documentDirectory}reba_audit_${Date.now()}.csv`;
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
        <Text style={styles.messageText}>Camera permission required for ergonomic video auditing.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live Camera Feed */}
      <CameraView style={styles.camera} facing="back">
        <Svg height={height * 0.45} width={width} style={styles.overlay}>
          <Line x1={width * 0.5} y1="40" x2={width * 0.5} y2="200" stroke={currentRisk.color} strokeWidth="4" />
          <Circle cx={width * 0.5} cy="30" r="12" stroke={currentRisk.color} strokeWidth="3" fill="transparent" />
        </Svg>
      </CameraView>

      {/* Control Panel */}
      <View style={styles.dashboard}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>REBA SCORE</Text>
            <Text style={[styles.scoreVal, { color: currentRisk.color }]}>{finalRebaScore}</Text>
          </View>
          <View style={styles.riskBox}>
            <Text style={styles.scoreLabel}>ACTION LEVEL</Text>
            <Text style={[styles.riskVal, { color: currentRisk.color }]}>{currentRisk.level}</Text>
          </View>
        </View>

        {/* Dynamic Controls for Posture Adjustments */}
        <ScrollView style={styles.controlsScroll}>
          <Text style={styles.sectionTitle}>Table A Settings (Group A)</Text>
          <View style={styles.adjRow}>
            <Text style={styles.adjLabel}>Trunk Pos ({trunkScore}):</Text>
            <TouchableOpacity onPress={() => setTrunkScore(Math.max(1, trunkScore - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setTrunkScore(Math.min(5, trunkScore + 1))} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
          </View>

          <View style={styles.adjRow}>
            <Text style={styles.adjLabel}>Neck Pos ({neckScore}):</Text>
            <TouchableOpacity onPress={() => setNeckScore(Math.max(1, neckScore - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setNeckScore(Math.min(2, neckScore + 1))} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
          </View>

          <View style={styles.adjRow}>
            <Text style={styles.adjLabel}>Legs Pos ({legScore}):</Text>
            <TouchableOpacity onPress={() => setLegScore(Math.max(1, legScore - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setLegScore(Math.min(2, legScore + 1))} style={styles.adjBtn}><Text style={styles.adjText}>+</Text></TouchableOpacity>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={logAudit}>
            <Text style={styles.btnText}>Record Log</Text>
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
  camera: { height: height * 0.45, width: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0 },
  dashboard: { flex: 1, backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  scoreBox: { backgroundColor: '#2A2A2A', flex: 1, marginRight: 6, padding: 10, borderRadius: 8, alignItems: 'center' },
  riskBox: { backgroundColor: '#2A2A2A', flex: 2, marginLeft: 6, padding: 10, borderRadius: 8, alignItems: 'center' },
  scoreLabel: { color: '#888', fontSize: 10, fontWeight: 'bold' },
  scoreVal: { fontSize: 24, fontWeight: 'bold' },
  riskVal: { fontSize: 16, fontWeight: 'bold', marginTop: 4 },
  controlsScroll: { flex: 1, marginBottom: 10 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  adjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, backgroundColor: '#2A2A2A', padding: 8, borderRadius: 6 },
  adjLabel: { color: '#FFF', fontSize: 12 },
  adjBtn: { backgroundColor: '#3A3A3A', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  adjText: { color: '#00FF66', fontSize: 18, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 1, backgroundColor: '#00FF66', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  btnText: { color: '#121212', fontWeight: 'bold' }
});
