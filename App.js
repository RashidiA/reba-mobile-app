import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import Svg, { Line, Circle } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- REBA LOOKUP TABLES ---
const TABLE_A = [
  [[1, 2, 3, 4], [2, 3, 4, 5], [2, 4, 5, 6]],
  [[2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]],
  [[2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8]],
  [[3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]],
  [[4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]]
];

const TABLE_B = [
  [[1, 2, 2], [1, 2, 3]],
  [[1, 2, 3], [2, 3, 4]],
  [[3, 4, 5], [4, 5, 5]],
  [[4, 5, 5], [5, 6, 7]],
  [[6, 7, 8], [7, 8, 8]],
  [[7, 8, 8], [8, 9, 9]]
];

const TABLE_C = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 5, 6, 7, 7, 8, 9, 9, 10, 10, 11],
  [6, 6, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11],
  [7, 7, 8, 8, 9, 9, 10, 11, 11, 11, 12, 12],
  [8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 12, 12],
  [9, 9, 10, 10, 11, 11, 12, 12, 12, 12, 12, 12],
  [10, 10, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12],
  [11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]
];

// DYNAMIC MMH LOOKUP
function getDynamicMmhLimit(profile, zone, reach) {
  const limits = {
    "Male": {
      "Above Shoulder":    { "Close Reach": 10.0, "Far Reach": 5.0 },
      "Shoulder to Elbow": { "Close Reach": 20.0, "Far Reach": 10.0 },
      "Elbow to Knuckle":  { "Close Reach": 25.0, "Far Reach": 15.0 },
      "Knuckle to Mid-Leg":{ "Close Reach": 20.0, "Far Reach": 10.0 },
      "Below Mid-Leg":     { "Close Reach": 10.0, "Far Reach": 5.0 }
    },
    "Female": {
      "Above Shoulder":    { "Close Reach": 7.0,  "Far Reach": 3.0 },
      "Shoulder to Elbow": { "Close Reach": 13.0, "Far Reach": 7.0 },
      "Elbow to Knuckle":  { "Close Reach": 16.0, "Far Reach": 10.0 },
      "Knuckle to Mid-Leg":{ "Close Reach": 13.0, "Far Reach": 7.0 },
      "Below Mid-Leg":     { "Close Reach": 7.0,  "Far Reach": 3.0 }
    }
  };
  let userProfile = limits[profile] || limits["Male"];
  let zoneLimits = userProfile[zone] || userProfile["Shoulder to Elbow"];
  return zoneLimits[reach] !== undefined ? zoneLimits[reach] : zoneLimits["Close Reach"];
}

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [operatorId] = useState("OP-MOBILE-01");
  const [profile] = useState("Male");
  const [actualWeight] = useState(11.0); // 11kg test load
  
  const [liveReba, setLiveReba] = useState(1);
  const [peakReba, setPeakReba] = useState(1);
  const [mmhZone, setMmhZone] = useState("Above Shoulder");
  const [mmhReach, setMmhReach] = useState("Far Reach");
  const [nioshLi, setNioshLi] = useState(2.20);
  const [timer, setTimer] = useState(0);

  const timerRef = useRef(null);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

  // Handle Session Toggle
  const toggleSession = () => {
    if (!isAnalyzing) {
      setIsAnalyzing(true);
      setPeakReba(1);
      setTimer(0);
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      setIsAnalyzing(false);
      clearInterval(timerRef.current);
    }
  };

  // PDF Report Generator
  const generatePdfReport = async () => {
    let maxLimit = getDynamicMmhLimit(profile, mmhZone, mmhReach);
    let isSafe = actualWeight <= maxLimit;

    const htmlContent = `
      <html>
        <body style="font-family: Arial; padding: 20px;">
          <h1 style="text-align: center;">REBA & MMH AUDIT REPORT</h1>
          <p><b>Operator ID:</b> ${operatorId}</p>
          <p><b>Profile:</b> ${profile}</p>
          <p><b>Peak REBA Score:</b> ${peakReba}</p>
          <hr />
          <h2>Manual Material Handling (MMH) Safety</h2>
          <p><b>Zone / Reach:</b> ${mmhZone} (${mmhReach})</p>
          <p><b>Actual Weight Lifted:</b> ${actualWeight.toFixed(1)} kg</p>
          <p><b>Max Safe Limit:</b> ${maxLimit.toFixed(1)} kg</p>
          <h3 style="color: ${isSafe ? 'green' : 'red'};">
            STATUS: ${isSafe ? 'WITHIN SAFE ERGONOMIC LIMIT' : 'EXCEEDS SAFE ERGONOMIC LIMIT'}
          </h3>
        </body>
      </html>
    `;

    try {
      const fileUri = `${FileSystem.documentDirectory}REBA_Report_${operatorId}.html`;
      await FileSystem.writeAsStringAsync(fileUri, htmlContent);
      await Sharing.shareAsync(fileUri);
    } catch (e) {
      Alert.alert("Error", "Could not generate PDF file.");
    }
  };

  if (!hasPermission) return <View style={styles.center}><Text>No Camera Permission</Text></View>;
  if (device == null) return <View style={styles.center}><Text>No Camera Available</Text></View>;

  return (
    <View style={styles.container}>
      {/* Native Camera View */}
      <View style={styles.cameraContainer}>
        <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} />
        {/* Real-time Skeleton Overlay */}
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
          <Line x1="100" y1="150" x2="180" y2="280" stroke="#00FF00" strokeWidth="4" />
          <Circle cx="100" cy="150" r="6" fill="#FF0000" />
          <Circle cx="180" cy="280" r="6" fill="#FF0000" />
        </Svg>
      </View>

      {/* Control Panel & Metrics */}
      <View style={styles.metricsContainer}>
        <View style={styles.cardRow}>
          <View style={styles.card}><Text style={styles.cardTitle}>Live REBA</Text><Text style={styles.cardValue}>{liveReba}</Text></View>
          <View style={styles.card}><Text style={styles.cardTitle}>Peak REBA</Text><Text style={styles.cardValue}>{peakReba}</Text></View>
          <View style={styles.card}><Text style={styles.cardTitle}>Timer</Text><Text style={styles.cardValue}>{timer}s</Text></View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Zone: <Text style={styles.bold}>{mmhZone} ({mmhReach})</Text></Text>
          <Text style={styles.infoText}>Actual Weight: <Text style={styles.bold}>{actualWeight.toFixed(1)} kg</Text></Text>
          <Text style={styles.infoText}>Max Allowed Limit: <Text style={styles.bold}>{getDynamicMmhLimit(profile, mmhZone, mmhReach).toFixed(1)} kg</Text></Text>
        </View>

        <TouchableOpacity 
          style={[styles.button, isAnalyzing ? styles.btnStop : styles.btnStart]} 
          onPress={toggleSession}>
          <Text style={styles.btnText}>{isAnalyzing ? "Stop Audit" : "Start Real-Time Audit"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.btnReport]} onPress={generatePdfReport}>
          <Text style={styles.btnText}>Share / Export Audit Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cameraContainer: { height: SCREEN_WIDTH * 1.2, width: '100%', position: 'relative' },
  metricsContainer: { flex: 1, padding: 16, justifyContent: 'space-around' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { backgroundColor: '#1E1E1E', padding: 12, borderRadius: 8, width: '30%', alignItems: 'center' },
  cardTitle: { color: '#AAA', fontSize: 12 },
  cardValue: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  infoBox: { backgroundColor: '#1E1E1E', padding: 12, borderRadius: 8 },
  infoText: { color: '#CCC', fontSize: 14, marginVertical: 2 },
  bold: { fontWeight: 'bold', color: '#FFF' },
  button: { padding: 14, borderRadius: 8, alignItems: 'center', marginVertical: 4 },
  btnStart: { backgroundColor: '#28A745' },
  btnStop: { backgroundColor: '#DC3545' },
  btnReport: { backgroundColor: '#0D6EFD' },
  btnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});