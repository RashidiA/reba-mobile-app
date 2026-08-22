import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, TextInput, PermissionsAndroid, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

// --- 1. FULL REBA LOOKUP TABLES ---
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

// --- 2. FULL MMH CAPACITY MATRIX ---
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

// --- 3. VISION ENGINE HTML (MEDIA STREAM FIX INCLUDED) ---
const cameraVisionHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js" crossorigin="anonymous"></script>
  <style>
    body { margin: 0; padding: 0; background: #000; overflow: hidden; }
    #video { width: 100vw; height: 35vh; object-fit: cover; }
    #canvas { position: absolute; top: 0; left: 0; width: 100vw; height: 35vh; }
  </style>
</head>
<body>
  <video id="video" playsinline webkit-playsinline muted autoplay></video>
  <canvas id="canvas"></canvas>

  <script>
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    function getAngle(a, b, c) {
      const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
      let angle = Math.abs((radians * 180.0) / Math.PI);
      return angle > 180.0 ? 360 - angle : angle;
    }

    const pose = new Pose({
      locateFile: (file) => \`https://cdn.jsdelivr.net/npm/@mediapipe/pose/\${file}\`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults((results) => {
      canvas.width = video.videoWidth || window.innerWidth;
      canvas.height = video.videoHeight || (window.innerHeight * 0.35);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!results.poseLandmarks) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ humanDetected: false }));
        return;
      }

      const lm = results.poseLandmarks;
      drawSkeleton(lm, ctx, canvas.width, canvas.height);

      const trunkAngle = Math.round(getAngle(lm[11], lm[23], lm[25]));
      const neckAngle = Math.round(getAngle(lm[0], lm[11], lm[23]));
      const armAngle = Math.round(getAngle(lm[11], lm[13], lm[15]));

      window.ReactNativeWebView.postMessage(JSON.stringify({
        humanDetected: true,
        trunk: Math.min(Math.max(Math.floor(trunkAngle / 20), 1), 5),
        neck: Math.min(Math.max(Math.floor(neckAngle / 15), 1), 3),
        upperArm: Math.min(Math.max(Math.floor(armAngle / 30), 1), 6)
      }));
    });

    function drawSkeleton(lm, ctx, w, h) {
      const connections = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24], [23,25], [24,26]];
      ctx.strokeStyle = '#00FF66';
      ctx.lineWidth = 3;
      connections.forEach(([i, j]) => {
        ctx.beginPath();
        ctx.moveTo(lm[i].x * w, lm[i].y * h);
        ctx.lineTo(lm[j].x * w, lm[j].y * h);
        ctx.stroke();
      });
      lm.forEach(pt => {
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#FF3B30';
        ctx.fill();
      });
    }

    async function startCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          video.srcObject = stream;
          const camera = new Camera(video, {
            onFrame: async () => { await pose.send({ image: video }); },
            width: 640, height: 480
          });
          camera.start();
        }
      } catch(e) {
        console.error("Camera Error: ", e);
      }
    }

    startCamera();
  </script>
</body>
</html>
`;

export default function App() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [humanDetected, setHumanDetected] = useState(false);

  // Simplified Inputs
  const [operatorName, setOperatorName] = useState('OP-101');
  const [processName, setProcessName] = useState('Spot Welding');
  const [gender, setGender] = useState('Male');
  const [weight, setWeight] = useState('12');

  // Dynamic Posture Joints (Pose Detection)
  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);
  const [legs, setLegs] = useState(1);
  const [upperArm, setUpperArm] = useState(1);
  const [lowerArm, setLowerArm] = useState(1);
  const [wrist, setWrist] = useState(1);

  // Request Android Camera Permissions
  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          { title: "Camera Permission", message: "App needs camera access for live posture detection." }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        return false;
      }
    }
    return true;
  };

  const handleToggleAnalysis = async () => {
    if (!isAnalyzing) {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert("Permission Error", "Camera access is required.");
        return;
      }
    }
    setIsAnalyzing(!isAnalyzing);
  };

  const onWebMessage = (event) => {
    if (!isAnalyzing) return;
    try {
      const data = JSON.parse(event.nativeEvent.data);
      setHumanDetected(data.humanDetected);
      if (data.humanDetected) {
        setTrunk(data.trunk || 1);
        setNeck(data.neck || 1);
        setUpperArm(data.upperArm || 1);
      }
    } catch (e) {}
  };

  // --- REBA CALCULATION ---
  const rebaScore = (() => {
    if (!humanDetected) return '-';
    const keyA = `${trunk}-${neck}-${legs}`;
    const scoreA = TABLE_A[keyA] || 1;
    const keyB = `${upperArm}-${lowerArm}-${wrist}`;
    const scoreB = TABLE_B[keyB] || 1;
    return TABLE_C[Math.min(scoreA - 1, 11)][Math.min(scoreB - 1, 11)];
  })();

  // --- NIOSH CALCULATION ---
  const loadNum = parseFloat(weight) || 0;
  const hm = 0.83; 
  const vm = 0.90; 
  const dm = 0.93; 
  const am = 1.00; 
  const rwl = parseFloat((23 * hm * vm * dm * am).toFixed(2));
  const liftingIndex = parseFloat((loadNum / (rwl || 1)).toFixed(2));

  // --- MMH CALCULATION ---
  const activeMMHLimit = MMH_MATRIX[gender][2]['close'];

  // --- 3-PAGE PDF REPORT EXPORT ---
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
                <p>Operator: <strong>${operatorName}</strong> | Process: <strong>${processName}</strong></p>
              </div>
              <div class="card-info">
                <strong>REBA Overall Calculated Score: ${rebaScore}</strong>
              </div>
              <div class="section-title">Posture Analysis Breakdown</div>
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
                <p>Operator: <strong>${operatorName}</strong> | Process: <strong>${processName}</strong></p>
              </div>
              <div class="card-info">
                <strong>Lifting Index (LI): ${liftingIndex}</strong> (Recommended Weight Limit: ${rwl} kg | Actual Load: ${loadNum} kg)
              </div>
              <div class="section-title">Standard Multipliers</div>
              <table>
                <tr><th>MULTIPLIER</th><th>VALUE</th></tr>
                <tr><td>Horizontal (HM)</td><td>${hm}</td></tr>
                <tr><td>Vertical (VM)</td><td>${vm}</td></tr>
                <tr><td>Distance (DM)</td><td>${dm}</td></tr>
                <tr><td>Asymmetric (AM)</td><td>${am}</td></tr>
              </table>
            </div>
            <div class="footer">Page 2 of 3 - NIOSH Assessment</div>
          </div>

          <div class="page">
            <div>
              <div class="header">
                <h1>MMH CAPACITY MATRIX REPORT</h1>
                <p>Operator: <strong>${operatorName}</strong> | Profile: <strong>${gender}</strong></p>
              </div>
              <div class="card-info">
                <strong>Current Load: ${loadNum} kg</strong> | Max Allowed Zone Threshold: ${activeMMHLimit} kg
              </div>
              <div class="section-title">Manual Material Handling Threshold Matrix</div>
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
      Alert.alert('Export Error', 'Failed to generate 3-page PDF report.');
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
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          androidCameraPermissionOptions={{
            title: 'Permission to use camera',
            message: 'We need your permission to use your camera',
            buttonPositive: 'Ok',
            buttonNegative: 'Cancel',
          }}
        />
      </View>

      <View style={styles.dashboard}>
        {/* Dynamic Multi-Tool Indicators */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>REBA SCORE</Text><Text style={styles.scoreVal}>{rebaScore}</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>NIOSH LI</Text><Text style={styles.scoreVal}>{liftingIndex}</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>MMH LIMIT</Text><Text style={styles.scoreVal}>{activeMMHLimit} kg</Text></View>
        </View>

        {/* Simplified User Inputs */}
        <ScrollView style={styles.formContainer}>
          <Text style={styles.sectionHeader}>Evaluation Parameters</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Operator Name / ID</Text>
            <TextInput style={styles.input} value={operatorName} onChangeText={setOperatorName} placeholder="Operator ID" placeholderTextColor="#666" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Process Name</Text>
            <TextInput style={styles.input} value={processName} onChangeText={setProcessName} placeholder="Process Name" placeholderTextColor="#666" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Gender Profile</Text>
            <View style={styles.genderRow}>
              <TouchableOpacity style={[styles.genderBtn, gender === 'Male' && styles.genderActive]} onPress={() => setGender('Male')}>
                <Text style={styles.genderTxt}>Male</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.genderBtn, gender === 'Female' && styles.genderActive]} onPress={() => setGender('Female')}>
                <Text style={styles.genderTxt}>Female</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Load Weight (kg)</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="10" placeholderTextColor="#666" />
          </View>
        </ScrollView>

        {/* Action Controls */}
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isAnalyzing ? '#FF3B30' : '#00FF66' }]} onPress={handleToggleAnalysis}>
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
  dashboard: { flex: 1, backgroundColor: '#1E1E1E', padding: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  scoreBox: { backgroundColor: '#2A2A2A', flex: 1, marginHorizontal: 2, padding: 8, borderRadius: 8, alignItems: 'center' },
  scoreLabel: { color: '#888', fontSize: 9, fontWeight: 'bold' },
  scoreVal: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  formContainer: { flex: 1, marginBottom: 10 },
  sectionHeader: { color: '#00FF66', fontWeight: 'bold', fontSize: 13, marginBottom: 10 },
  inputGroup: { marginBottom: 10 },
  label: { color: '#CCC', fontSize: 11, marginBottom: 4 },
  input: { backgroundColor: '#2A2A2A', color: '#FFF', borderRadius: 6, padding: 8, fontSize: 13 },
  genderRow: { flexDirection: 'row' },
  genderBtn: { flex: 1, backgroundColor: '#2A2A2A', paddingVertical: 8, alignItems: 'center', borderRadius: 6, marginHorizontal: 2 },
  genderActive: { backgroundColor: '#00FF66' },
  genderTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  btnText: { color: '#121212', fontWeight: 'bold', fontSize: 12 }
});
