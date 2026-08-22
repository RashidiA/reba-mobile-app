import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

const { width } = Dimensions.get('window');

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

// --- MEDIAPIPE VISION HTML ENGINE ---
const cameraVisionHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"></script>
  <script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd"></script>
  <style>
    body { margin: 0; padding: 0; background: #000; overflow: hidden; }
    #video { width: 100vw; height: 35vh; object-fit: cover; }
    #canvas { position: absolute; top: 0; left: 0; width: 100vw; height: 35vh; }
  </style>
</head>
<body>
  <video id="video" playsinline></video>
  <canvas id="canvas"></canvas>

  <script>
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let cocoModel = null;

    cocoSsd.load().then(model => { cocoModel = model; });

    function getAngle(a, b, c) {
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let angle = Math.abs((radians * 180.0) / Math.PI);
      if (angle > 180.0) angle = 360 - angle;
      return angle;
    }

    const pose = new Pose({
      locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    pose.onResults(async (results) => {
      canvas.width = video.videoWidth || window.innerWidth;
      canvas.height = video.videoHeight || (window.innerHeight * 0.35);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!results.poseLandmarks) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          humanDetected: false,
          objectText: "No Object Detected"
        }));
        return;
      }

      const landmarks = results.poseLandmarks;
      drawSkeleton(landmarks, ctx, canvas.width, canvas.height);

      const trunkAngle = Math.round(getAngle(landmarks[11], landmarks[23], landmarks[25]));
      const neckAngle = Math.round(getAngle(landmarks[0], landmarks[11], landmarks[23]));
      const armAngle = Math.round(getAngle(landmarks[11], landmarks[13], landmarks[15]));

      let detectedObjectStr = "No Object Detected";
      if (cocoModel) {
        const predictions = await cocoModel.detect(video);
        const handL = landmarks[15];
        const handR = landmarks[16];

        const handObj = predictions.find(p => {
          const cx = p.bbox[0] + p.bbox[2]/2;
          const cy = p.bbox[1] + p.bbox[3]/2;
          return (Math.abs(cx - handL.x * canvas.width) < 80) || (Math.abs(cx - handR.x * canvas.width) < 80);
        });

        if (handObj) {
          detectedObjectStr = handObj.class;
        }
      }

      window.ReactNativeWebView.postMessage(JSON.stringify({
        humanDetected: true,
        trunk: Math.min(Math.max(Math.floor(trunkAngle / 20), 1), 5),
        neck: Math.min(Math.max(Math.floor(neckAngle / 15), 1), 3),
        upperArm: Math.min(Math.max(Math.floor(armAngle / 30), 1), 6),
        objectText: detectedObjectStr
      }));
    });

    function drawSkeleton(lm, ctx, w, h) {
      const connections = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26]];
      ctx.strokeStyle = '#00FF66';
      ctx.lineWidth = 4;

      connections.forEach(([i, j]) => {
        ctx.beginPath();
        ctx.moveTo(lm[i].x * w, lm[i].y * h);
        ctx.lineTo(lm[j].x * w, lm[j].y * h);
        ctx.stroke();
      });

      lm.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#FF3B30';
        ctx.fill();
      });
    }

    const camera = new Camera(video, {
      onFrame: async () => { await pose.send({ image: video }); },
      width: 640, height: 480
    });
    camera.start();
  </script>
</body>
</html>
`;

export default function App() {
  const [mode, setMode] = useState('REBA');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [humanDetected, setHumanDetected] = useState(false);
  const [detectedObject, setDetectedObject] = useState('No Object Detected');

  const [operationName, setOperationName] = useState('OP-001');
  const [gender, setGender] = useState('Male');
  const [loadWeight, setLoadWeight] = useState(10);

  // REBA Interactive State
  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);
  const [legs, setLegs] = useState(1);
  const [upperArm, setUpperArm] = useState(1);
  const [lowerArm, setLowerArm] = useState(1);
  const [wrist, setWrist] = useState(1);

  // NIOSH Interactive State
  const [horizontalDist, setHorizontalDist] = useState(30);
  const [verticalDist, setVerticalDist] = useState(85);
  const [travelDist, setTravelDist] = useState(25);
  const [asymmetryAngle, setAsymmetryAngle] = useState(0);

  const onWebMessage = (event) => {
    if (!isAnalyzing) return;
    try {
      const data = JSON.parse(event.nativeEvent.data);
      setHumanDetected(data.humanDetected);
      if (data.humanDetected) {
        setTrunk(data.trunk || 1);
        setNeck(data.neck || 1);
        setUpperArm(data.upperArm || 1);
        setDetectedObject(data.objectText || 'No Object Detected');
      } else {
        setDetectedObject('No Object Detected');
      }
    } catch (e) {}
  };

  // Calculations
  const rebaScore = (() => {
    if (!humanDetected) return '-';
    const keyA = `${trunk}-${neck}-${legs}`;
    const scoreA = TABLE_A[keyA] || 1;
    const keyB = `${upperArm}-${lowerArm}-${wrist}`;
    const scoreB = TABLE_B[keyB] || 1;
    return TABLE_C[Math.min(scoreA - 1, 11)][Math.min(scoreB - 1, 11)];
  })();

  const hmFactor = parseFloat((Math.min(1.0, 25 / Math.max(horizontalDist, 25))).toFixed(2));
  const vmFactor = parseFloat((Math.max(0, 1 - 0.003 * Math.abs(verticalDist - 75))).toFixed(2));
  const dmFactor = parseFloat((Math.min(1.0, 0.82 + 4.5 / Math.max(travelDist, 25))).toFixed(2));
  const amFactor = parseFloat((Math.max(0, 1 - 0.0032 * asymmetryAngle)).toFixed(2));
  const rwl = parseFloat((23 * hmFactor * vmFactor * dmFactor * amFactor).toFixed(2));
  const liftingIndex = parseFloat((loadWeight / (rwl || 1)).toFixed(2));

  const activeMMHLimit = MMH_MATRIX[gender][2]['close'];

  // PDF Export
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
            .card-info { background-color: #ebf5fb; border-left: 4px solid #2980b9; padding: 8px; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #d5dbdb; padding: 5px 6px; text-align: left; font-size: 9.5px; }
            th { background-color: #2c3e50; color: #ffffff; text-transform: uppercase; font-size: 9px; }
            .section-title { font-size: 11px; font-weight: bold; color: #2c3e50; margin: 8px 0 4px 0; border-bottom: 1px solid #ae2012; padding-bottom: 2px; }
            .footer { font-size: 8.5px; text-align: center; color: #7f8c8d; border-top: 1px solid #d5dbdb; padding-top: 4px; }
          </style>
        </head>
        <body>
          <div class="page">
            <div>
              <div class="header">
                <h1>REBA POSTURE AUDIT REPORT</h1>
                <p>Operator ID: <strong>${operationName}</strong> | Object Identified: <strong>${detectedObject}</strong></p>
              </div>
              <div class="card-info">
                <strong>REBA Overall Score: ${rebaScore}</strong>
              </div>
              <div class="section-title">Posture Analysis Summary</div>
              <table>
                <tr><th>BODY SEGMENT</th><th>CURRENT SCORE</th></tr>
                <tr><td>Trunk</td><td>${trunk}</td></tr>
                <tr><td>Neck</td><td>${neck}</td></tr>
                <tr><td>Legs</td><td>${legs}</td></tr>
                <tr><td>Upper Arm</td><td>${upperArm}</td></tr>
                <tr><td>Lower Arm</td><td>${lowerArm}</td></tr>
                <tr><td>Wrist</td><td>${wrist}</td></tr>
              </table>
            </div>
            <div class="footer">Page 1 of 3 - REBA Assessment</div>
          </div>

          <div class="page">
            <div>
              <div class="header">
                <h1>NIOSH LIFTING EVALUATION REPORT</h1>
                <p>Operator ID: <strong>${operationName}</strong></p>
              </div>
              <div class="card-info">
                <strong>Lifting Index (LI): ${liftingIndex}</strong> (RWL: ${rwl} kg)
              </div>
              <div class="section-title">Lifting Multipliers</div>
              <table>
                <tr><th>MULTIPLIER</th><th>VALUE</th></tr>
                <tr><td>Horizontal (HM)</td><td>${hmFactor}</td></tr>
                <tr><td>Vertical (VM)</td><td>${vmFactor}</td></tr>
                <tr><td>Distance (DM)</td><td>${dmFactor}</td></tr>
                <tr><td>Asymmetric (AM)</td><td>${amFactor}</td></tr>
              </table>
            </div>
            <div class="footer">Page 2 of 3 - NIOSH Assessment</div>
          </div>

          <div class="page">
            <div>
              <div class="header">
                <h1>MMH CAPACITY MATRIX REPORT</h1>
                <p>Operator ID: <strong>${operationName}</strong> | Profile: <strong>${gender}</strong></p>
              </div>
              <div class="card-info">
                <strong>Current Load: ${loadWeight} kg</strong> | Max Allowed Threshold: ${activeMMHLimit} kg
              </div>
              <div class="section-title">Manual Material Handling Limits</div>
              <table>
                <tr><th>ZONE</th><th>CLOSE REACH</th><th>FAR REACH</th></tr>
                ${MMH_MATRIX[gender].map(r => `<tr><td>${r.zone}</td><td>${r.close} kg</td><td>${r.far} kg</td></tr>`).join('')}
              </table>
            </div>
            <div class="footer">Page 3 of 3 - MMH Assessment</div>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (err) {
      Alert.alert('Error', 'Failed to generate 3-page PDF report.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.cameraBox}>
        <WebView
          originWhitelist={['*']}
          source={{ html: cameraVisionHTML }}
          style={styles.webView}
          onMessage={onWebMessage}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      </View>

      <View style={styles.dashboard}>
        {/* Mode Selector */}
        <View style={styles.modeToggle}>
          {['REBA', 'NIOSH', 'MMH'].map((m) => (
            <TouchableOpacity key={m} style={[styles.toggleBtn, mode === m && styles.toggleActive]} onPress={() => setMode(m)}>
              <Text style={styles.toggleText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Live Status Header */}
        <View style={styles.objectCard}>
          <Text style={styles.scoreLabel}>HUMAN STATUS: <Text style={{ color: humanDetected ? '#00FF66' : '#FF3B30' }}>{humanDetected ? 'TRACKING LIVE' : 'NO HUMAN DETECTED'}</Text></Text>
          <Text style={[styles.objectValue, { color: detectedObject === 'No Object Detected' ? '#888' : '#00FF66' }]}>{detectedObject}</Text>
        </View>

        {/* Dynamic Metric Display */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>REBA SCORE</Text><Text style={styles.scoreVal}>{rebaScore}</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>NIOSH LI</Text><Text style={styles.scoreVal}>{liftingIndex}</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>MMH LIMIT</Text><Text style={styles.scoreVal}>{activeMMHLimit} kg</Text></View>
        </View>

        {/* Active Tab UI Controls */}
        <ScrollView style={styles.controlsScroll}>
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Operator ID:</Text>
            <TextInput style={styles.textInput} value={operationName} onChangeText={setOperationName} />
          </View>

          {mode === 'REBA' && (
            <View>
              <Text style={styles.sectionHeader}>REBA Posture Overrides</Text>
              <View style={styles.counterRow}>
                <Text style={styles.inputLabel}>Trunk Score: {trunk}</Text>
                <View style={styles.btnGroup}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setTrunk(Math.max(1, trunk - 1))}><Text style={styles.btnTxt}>-</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setTrunk(Math.min(5, trunk + 1))}><Text style={styles.btnTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
              <View style={styles.counterRow}>
                <Text style={styles.inputLabel}>Neck Score: {neck}</Text>
                <View style={styles.btnGroup}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setNeck(Math.max(1, neck - 1))}><Text style={styles.btnTxt}>-</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setNeck(Math.min(3, neck + 1))}><Text style={styles.btnTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
              <View style={styles.counterRow}>
                <Text style={styles.inputLabel}>Upper Arm Score: {upperArm}</Text>
                <View style={styles.btnGroup}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setUpperArm(Math.max(1, upperArm - 1))}><Text style={styles.btnTxt}>-</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setUpperArm(Math.min(6, upperArm + 1))}><Text style={styles.btnTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {mode === 'NIOSH' && (
            <View>
              <Text style={styles.sectionHeader}>NIOSH Lifting Parameters</Text>
              <View style={styles.counterRow}>
                <Text style={styles.inputLabel}>Horizontal Dist (cm): {horizontalDist}</Text>
                <View style={styles.btnGroup}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setHorizontalDist(Math.max(25, horizontalDist - 5))}><Text style={styles.btnTxt}>-</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setHorizontalDist(horizontalDist + 5)}><Text style={styles.btnTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
              <View style={styles.counterRow}>
                <Text style={styles.inputLabel}>Vertical Dist (cm): {verticalDist}</Text>
                <View style={styles.btnGroup}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setVerticalDist(Math.max(0, verticalDist - 5))}><Text style={styles.btnTxt}>-</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setVerticalDist(verticalDist + 5)}><Text style={styles.btnTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
              <View style={styles.counterRow}>
                <Text style={styles.inputLabel}>Asymmetry (°): {asymmetryAngle}</Text>
                <View style={styles.btnGroup}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setAsymmetryAngle(Math.max(0, asymmetryAngle - 15))}><Text style={styles.btnTxt}>-</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setAsymmetryAngle(Math.min(135, asymmetryAngle + 15))}><Text style={styles.btnTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {mode === 'MMH' && (
            <View>
              <Text style={styles.sectionHeader}>MMH Profile Configuration</Text>
              <View style={styles.genderRow}>
                <TouchableOpacity style={[styles.genderBtn, gender === 'Male' && styles.genderActive]} onPress={() => setGender('Male')}>
                  <Text style={styles.genderTxt}>Male</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.genderBtn, gender === 'Female' && styles.genderActive]} onPress={() => setGender('Female')}>
                  <Text style={styles.genderTxt}>Female</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.counterRow}>
                <Text style={styles.inputLabel}>Load Weight (kg): {loadWeight}</Text>
                <View style={styles.btnGroup}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setLoadWeight(Math.max(1, loadWeight - 1))}><Text style={styles.btnTxt}>-</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setLoadWeight(loadWeight + 1)}><Text style={styles.btnTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Global Action Buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isAnalyzing ? '#FF3B30' : '#00FF66' }]} onPress={() => setIsAnalyzing(!isAnalyzing)}>
            <Text style={styles.btnText}>{isAnalyzing ? 'Stop Analysis' : 'Start Analysis'}</Text>
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
  cameraBox: { height: '35%', width: '100%' },
  webView: { flex: 1 },
  dashboard: { flex: 1, backgroundColor: '#1E1E1E', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modeToggle: { flexDirection: 'row', backgroundColor: '#2A2A2A', borderRadius: 8, marginBottom: 10 },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  toggleActive: { backgroundColor: '#00FF66', borderRadius: 8 },
  toggleText: { color: '#FFF', fontWeight: 'bold' },
  objectCard: { backgroundColor: '#2A2A2A', padding: 8, borderRadius: 8, marginBottom: 10, alignItems: 'center' },
  objectValue: { fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  scoreBox: { backgroundColor: '#2A2A2A', flex: 1, marginHorizontal: 2, padding: 8, borderRadius: 8, alignItems: 'center' },
  scoreLabel: { color: '#888', fontSize: 9, fontWeight: 'bold' },
  scoreVal: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  controlsScroll: { flex: 1, marginBottom: 10 },
  inputCard: { backgroundColor: '#2A2A2A', padding: 10, borderRadius: 8, marginBottom: 8 },
  inputLabel: { color: '#FFF', fontSize: 12 },
  textInput: { backgroundColor: '#1E1E1E', color: '#FFF', borderRadius: 6, padding: 6, marginTop: 4 },
  sectionHeader: { color: '#00FF66', fontWeight: 'bold', fontSize: 12, marginTop: 6, marginBottom: 6 },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2A2A2A', padding: 8, borderRadius: 6, marginBottom: 6 },
  btnGroup: { flexDirection: 'row' },
  stepBtn: { backgroundColor: '#3A3A3A', width: 28, height: 28, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginLeft: 6 },
  btnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  genderRow: { flexDirection: 'row', marginBottom: 8 },
  genderBtn: { flex: 1, backgroundColor: '#2A2A2A', paddingVertical: 8, alignItems: 'center', borderRadius: 6, marginHorizontal: 2 },
  genderActive: { backgroundColor: '#00FF66' },
  genderTxt: { color: '#FFF', fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  btnText: { color: '#121212', fontWeight: 'bold' }
});
