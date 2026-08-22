import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

const { width, height } = Dimensions.get('window');

// --- COCO DATASET CLASS LIST ---
const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
  'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
  'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'
];

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

// --- MMH 5x2 MATRIX ---
const MMH_MATRIX = {
  Male: [
    { zone: 'Above Shoulder (>140cm)', close: 10, far: 5 },
    { zone: 'Shoulder to Elbow (100-140cm)', close: 20, far: 10 },
    { zone: 'Elbow to Knuckle (75-100cm)', close: 25, far: 15 },
    { zone: 'Knuckle to Mid-Leg (50-75cm)', close: 20, far: 10 },
    { zone: 'Below Mid-Leg (<50cm)', close: 10, far: 5 }
  ],
  Female: [
    { zone: 'Above Shoulder (>140cm)', close: 7, far: 3 },
    { zone: 'Shoulder to Elbow (100-140cm)', close: 13, far: 7 },
    { zone: 'Elbow to Knuckle (75-100cm)', close: 16, far: 10 },
    { zone: 'Knuckle to Mid-Leg (50-75cm)', close: 13, far: 7 },
    { zone: 'Below Mid-Leg (<50cm)', close: 7, far: 3 }
  ]
};

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState('REBA');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Object Detection State
  const [detectedObject, setDetectedObject] = useState('No Object Detected');

  // Operational Inputs
  const [operationName, setOperationName] = useState('OP-001');
  const [gender, setGender] = useState('Male');
  const [loadWeight, setLoadWeight] = useState(10);

  // Joint Angles
  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);
  const [legs, setLegs] = useState(1);
  const [upperArm, setUpperArm] = useState(1);
  const [lowerArm, setLowerArm] = useState(1);
  const [wrist, setWrist] = useState(1);

  // Spatial Dimensions
  const [horizontalDist, setHorizontalDist] = useState(30);
  const [verticalDist, setVerticalDist] = useState(85);
  const [travelDist, setTravelDist] = useState(25);
  const [asymmetryAngle, setAsymmetryAngle] = useState(0);

  // Session Stats
  const [analysisDuration, setAnalysisDuration] = useState(0);
  const [peakReba, setPeakReba] = useState(1);
  const [durations, setDurations] = useState({
    trunk: { low: 0, med: 0, high: 0 },
    neck: { low: 0, med: 0, high: 0 },
    upperArm: { low: 0, med: 0, high: 0 },
    legs: { low: 0, med: 0, high: 0 },
    wrists: { low: 0, med: 0, high: 0 },
  });

  const timerRef = useRef(null);

  useEffect(() => {
    if (!permission) requestPermission();
  }, [permission]);

  // --- OBJECT IDENTIFICATION EVALUATOR ---
  const evaluateHandObject = (detectedClass, confidence) => {
    // Condition 1: Not detect object at all
    if (!detectedClass || confidence < 0.4) {
      return 'No Object Detected';
    }

    // Condition 2: Object detected on hand
    const normalizedClass = detectedClass.toLowerCase();
    if (COCO_CLASSES.includes(normalizedClass)) {
      return detectedClass; // Display COCO object name
    } else {
      return 'Unidentified Object'; // Display Unidentified Object if not in COCO list
    }
  };

  // --- REBA SCORE CALCULATOR ---
  const rebaScore = (() => {
    const keyA = `${trunk}-${neck}-${legs}`;
    const scoreA = TABLE_A[keyA] || 1;
    const keyB = `${upperArm}-${lowerArm}-${wrist}`;
    const scoreB = TABLE_B[keyB] || 1;
    const rowIdx = Math.min(Math.max(scoreA - 1, 0), 11);
    const colIdx = Math.min(Math.max(scoreB - 1, 0), 11);
    return TABLE_C[rowIdx][colIdx];
  })();

  // --- NIOSH CALCULATIONS ---
  const hmFactor = parseFloat((Math.min(1.0, 25 / Math.max(horizontalDist, 25))).toFixed(2));
  const vmFactor = parseFloat((Math.max(0, 1 - 0.003 * Math.abs(verticalDist - 75))).toFixed(2));
  const dmFactor = parseFloat((Math.min(1.0, 0.82 + 4.5 / Math.max(travelDist, 25))).toFixed(2));
  const amFactor = parseFloat((Math.max(0, 1 - 0.0032 * asymmetryAngle)).toFixed(2));

  const rwl = parseFloat((23 * hmFactor * vmFactor * dmFactor * amFactor).toFixed(2));
  const liftingIndex = parseFloat((loadWeight / (rwl || 1)).toFixed(2));

  // --- MMH CALCULATION ---
  const getMMHRowIndex = (v) => {
    if (v > 140) return 0;
    if (v >= 100) return 1;
    if (v >= 75) return 2;
    if (v >= 50) return 3;
    return 4;
  };

  const mmhRowIdx = getMMHRowIndex(verticalDist);
  const isFarReach = horizontalDist > 40;
  const activeMMHLimit = MMH_MATRIX[gender][mmhRowIdx][isFarReach ? 'far' : 'close'];

  // --- SIMULATED INFERENCE & METRIC TICKER ---
  useEffect(() => {
    if (isAnalyzing) {
      timerRef.current = setInterval(() => {
        setAnalysisDuration((prev) => prev + 0.1);

        // Random joint angle updates
        const simTrunk = Math.floor(Math.random() * 3) + 1;
        const simNeck = Math.floor(Math.random() * 2) + 1;
        const simLegs = Math.floor(Math.random() * 2) + 1;
        const simUpperArm = Math.floor(Math.random() * 4) + 1;
        const simLowerArm = Math.floor(Math.random() * 2) + 1;
        const simWrist = Math.floor(Math.random() * 2) + 1;

        setTrunk(simTrunk);
        setNeck(simNeck);
        setLegs(simLegs);
        setUpperArm(simUpperArm);
        setLowerArm(simLowerArm);
        setWrist(simWrist);

        // Simulate Dynamic Hand Object Identification Stream
        const objectPool = [
          { name: null, confidence: 0.1 },             // Triggers Condition 1: No Object Detected
          { name: 'bottle', confidence: 0.88 },         // Triggers Condition 2a: COCO Match ("bottle")
          { name: 'cup', confidence: 0.92 },            // Triggers Condition 2a: COCO Match ("cup")
          { name: 'industrial_part', confidence: 0.85 } // Triggers Condition 2b: "Unidentified Object"
        ];
        const sample = objectPool[Math.floor(Math.random() * objectPool.length)];
        setDetectedObject(evaluateHandObject(sample.name, sample.confidence));

        // Spatial recalculations
        const newH = Math.min(80, 25 + simUpperArm * 8);
        const newV = Math.max(30, 130 - simTrunk * 20);
        setHorizontalDist(newH);
        setVerticalDist(newV);

        setPeakReba((prev) => Math.max(prev, rebaScore));

        setDurations((prev) => ({
          trunk: { ...prev.trunk, [simTrunk <= 2 ? 'low' : simTrunk <= 4 ? 'med' : 'high']: prev.trunk[simTrunk <= 2 ? 'low' : simTrunk <= 4 ? 'med' : 'high'] + 0.1 },
          neck: { ...prev.neck, [simNeck <= 2 ? 'low' : 'med']: prev.neck[simNeck <= 2 ? 'low' : 'med'] + 0.1 },
          upperArm: { ...prev.upperArm, [simUpperArm <= 2 ? 'low' : simUpperArm <= 4 ? 'med' : 'high']: prev.upperArm[simUpperArm <= 2 ? 'low' : simUpperArm <= 4 ? 'med' : 'high'] + 0.1 },
          legs: { ...prev.legs, [simLegs <= 2 ? 'low' : 'med']: prev.legs[simLegs <= 2 ? 'low' : 'med'] + 0.1 },
          wrists: { ...prev.wrists, [simWrist <= 2 ? 'low' : 'med']: prev.wrists[simWrist <= 2 ? 'low' : 'med'] + 0.1 },
        }));
      }, 100);
    } else {
      clearInterval(timerRef.current);
      setDetectedObject('No Object Detected');
    }
    return () => clearInterval(timerRef.current);
  }, [isAnalyzing, rebaScore]);

  const toggleAnalysis = () => {
    setIsAnalyzing(!isAnalyzing);
  };

  const calcPct = (val, total) => (total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0.0%');

  // PDF Export Function
  const exportPDFReport = async () => {
    const totalT = Math.max(analysisDuration, 1);

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
            .active-cell { background-color: #f1c40f !important; font-weight: bold; color: #000; }
            .section-title { font-size: 11px; font-weight: bold; color: #2c3e50; margin: 8px 0 4px 0; border-bottom: 1px solid #ae2012; padding-bottom: 2px; }
            .footer { font-size: 8.5px; text-align: center; color: #7f8c8d; border-top: 1px solid #d5dbdb; padding-top: 4px; }
          </style>
        </head>
        <body>
          <div class="page">
            <div>
              <div class="header">
                <h1>REBA POSTURE AUDIT REPORT</h1>
                <p>Operator: <strong>${operationName}</strong> | Last Hand Object: <strong>${detectedObject}</strong></p>
              </div>

              <div class="section-title">Full-Body Posture Duration Breakdown</div>
              <table>
                <tr><th>BODY PART</th><th>SCORE 1-2 (%)</th><th>SCORE 3-4 (%)</th><th>SCORE 5+ (%)</th></tr>
                <tr><td>Trunk</td><td>${calcPct(durations.trunk.low, totalT)}</td><td>${calcPct(durations.trunk.med, totalT)}</td><td>${calcPct(durations.trunk.high, totalT)}</td></tr>
                <tr><td>Neck</td><td>${calcPct(durations.neck.low, totalT)}</td><td>${calcPct(durations.neck.med, totalT)}</td><td>0.0%</td></tr>
                <tr><td>Upper Arm</td><td>${calcPct(durations.upperArm.low, totalT)}</td><td>${calcPct(durations.upperArm.med, totalT)}</td><td>${calcPct(durations.upperArm.high, totalT)}</td></tr>
                <tr><td>Legs</td><td>${calcPct(durations.legs.low, totalT)}</td><td>${calcPct(durations.legs.med, totalT)}</td><td>0.0%</td></tr>
                <tr><td>Wrists</td><td>${calcPct(durations.wrists.low, totalT)}</td><td>${calcPct(durations.wrists.med, totalT)}</td><td>0.0%</td></tr>
              </table>
            </div>
            <div class="footer">Page 1 of 3 - Ergonomic Assessment</div>
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

  // Skeleton Visual Anchors
  const centerX = width * 0.5;
  const headY = 40;
  const neckY = 65;
  const shoulderX = centerX + (isAnalyzing ? (trunk - 2) * 15 : 0);
  const hipY = 160;
  const hipX = centerX;
  const handX = shoulderX + (isAnalyzing ? upperArm * 12 : 25);
  const handY = neckY + (isAnalyzing ? lowerArm * 15 : 35);

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back">
        <Svg height={height * 0.35} width={width} style={styles.overlay}>
          <Circle cx={centerX} cy={headY} r="14" stroke={isAnalyzing ? '#FF3B30' : '#00FF66'} strokeWidth="3" fill="transparent" />
          <Line x1={centerX} y1={headY + 14} x2={shoulderX} y2={neckY} stroke={isAnalyzing ? '#FF3B30' : '#00FF66'} strokeWidth="4" />
          <Line x1={shoulderX} y1={neckY} x2={hipX} y2={hipY} stroke={isAnalyzing ? '#FF3B30' : '#00FF66'} strokeWidth="5" />
          <Line x1={shoulderX} y1={neckY} x2={handX} y2={handY} stroke={isAnalyzing ? '#FFCC00' : '#00FF66'} strokeWidth="4" />
          
          {/* Hand Bounding Point */}
          <Circle cx={handX} cy={handY} r="8" fill={detectedObject === 'No Object Detected' ? '#888' : '#00FF66'} />
          
          {/* On-Camera Hand Detection Label */}
          <SvgText
            x={handX + 12}
            y={handY + 4}
            fill={detectedObject === 'No Object Detected' ? '#AAA' : '#00FF66'}
            fontSize="10"
            fontWeight="bold">
            {detectedObject}
          </SvgText>
        </Svg>
      </CameraView>

      <View style={styles.dashboard}>
        <View style={styles.modeToggle}>
          <TouchableOpacity style={[styles.toggleBtn, mode === 'REBA' && styles.toggleActive]} onPress={() => setMode('REBA')}>
            <Text style={styles.toggleText}>REBA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, mode === 'NIOSH' && styles.toggleActive]} onPress={() => setMode('NIOSH')}>
            <Text style={styles.toggleText}>NIOSH</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, mode === 'MMH' && styles.toggleActive]} onPress={() => setMode('MMH')}>
            <Text style={styles.toggleText}>MMH Matrix</Text>
          </TouchableOpacity>
        </View>

        {/* Live Detected Hand Object Display Card */}
        <View style={styles.objectCard}>
          <Text style={styles.scoreLabel}>HAND OBJECT DETECTED:</Text>
          <Text style={[
            styles.objectValue,
            { color: detectedObject === 'No Object Detected' ? '#888' : detectedObject === 'Unidentified Object' ? '#FFCC00' : '#00FF66' }
          ]}>
            {detectedObject}
          </Text>
        </View>

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
            <Text style={[styles.scoreVal, loadWeight > activeMMHLimit && { color: '#FF3B30' }]}>{activeMMHLimit} kg</Text>
          </View>
        </View>

        <ScrollView style={styles.controlsScroll}>
          {mode === 'MMH' && (
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>MMH Active Capacity Matrix ({gender})</Text>
              {MMH_MATRIX[gender].map((r, idx) => (
                <View key={idx} style={[styles.matrixRow, idx === mmhRowIdx && styles.matrixRowActive]}>
                  <Text style={[styles.matrixCell, { flex: 2 }, idx === mmhRowIdx && styles.activeText]}>{r.zone}</Text>
                  <Text style={[styles.matrixCell, idx === mmhRowIdx && !isFarReach && styles.activeHighlight]}>{r.close}kg</Text>
                  <Text style={[styles.matrixCell, idx === mmhRowIdx && isFarReach && styles.activeHighlight]}>{r.far}kg</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Operator ID:</Text>
            <TextInput style={styles.textInput} value={operationName} onChangeText={setOperationName} placeholder="e.g. OP-001" placeholderTextColor="#888" />
          </View>

          <View style={styles.inputCard}>
            <View style={styles.adjRow}>
              <Text style={styles.inputLabel}>Profile Gender:</Text>
              <View style={styles.btnGroup}>
                <TouchableOpacity onPress={() => setGender('Male')} style={[styles.genderBtn, gender === 'Male' && styles.genderActive]}><Text style={styles.genderText}>Male</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setGender('Female')} style={[styles.genderBtn, gender === 'Female' && styles.genderActive, { marginLeft: 8 }]}><Text style={styles.genderText}>Female</Text></TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.inputCard}>
            <View style={styles.adjRow}>
              <Text style={styles.inputLabel}>Load Weight ({loadWeight} kg):</Text>
              <View style={styles.btnGroup}>
                <TouchableOpacity onPress={() => setLoadWeight(Math.max(1, loadWeight - 1))} style={styles.adjBtn}><Text style={styles.adjText}>-</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setLoadWeight(loadWeight + 1)} style={[styles.adjBtn, { marginLeft: 8 }]}><Text style={styles.adjText}>+</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.actionBtn, isAnalyzing ? { backgroundColor: '#FF3B30' } : { backgroundColor: '#00FF66' }]} onPress={toggleAnalysis}>
            <Text style={styles.btnText}>{isAnalyzing ? 'Stop Analysis' : 'Start Analysis'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF9900' }]} onPress={exportPDFReport}>
            <Text style={styles.btnText}>Export PDF</Text>
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
  modeToggle: { flexDirection: 'row', backgroundColor: '#2A2A2A', borderRadius: 8, marginBottom: 10 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: '#00FF66' },
  toggleText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  objectCard: { backgroundColor: '#2A2A2A', padding: 8, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  objectValue: { fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  scoreBox: { backgroundColor: '#2A2A2A', flex: 1, marginHorizontal: 3, padding: 8, borderRadius: 8, alignItems: 'center' },
  scoreLabel: { color: '#888', fontSize: 9, fontWeight: 'bold' },
  scoreVal: { fontSize: 16, fontWeight: 'bold', color: '#FFF', marginTop: 4 },
  controlsScroll: { flex: 1, marginBottom: 10 },
  inputCard: { backgroundColor: '#2A2A2A', padding: 10, borderRadius: 8, marginBottom: 8 },
  inputLabel: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  textInput: { backgroundColor: '#1E1E1E', color: '#FFF', borderRadius: 6, padding: 8, marginTop: 4, fontSize: 13 },
  adjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnGroup: { flexDirection: 'row' },
  adjBtn: { backgroundColor: '#3A3A3A', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  adjText: { color: '#00FF66', fontSize: 18, fontWeight: 'bold' },
  genderBtn: { backgroundColor: '#3A3A3A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  genderActive: { backgroundColor: '#00FF66' },
  genderText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  matrixRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 4 },
  matrixRowActive: { backgroundColor: '#333' },
  matrixCell: { color: '#888', fontSize: 10, flex: 1, textAlign: 'center' },
  activeText: { color: '#FFF', fontWeight: 'bold' },
  activeHighlight: { backgroundColor: '#F1C40F', color: '#000', fontWeight: 'bold', borderRadius: 4 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  btnText: { color: '#121212', fontWeight: 'bold' }
});
