import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, TextInput, PermissionsAndroid, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

// --- LOOKUP TABLES ---
const TABLE_A = {
  '1-1-1': 1, '1-1-2': 2, '1-2-1': 2, '1-2-2': 3,
  '2-1-1': 2, '2-1-2': 3, '2-2-1': 3, '2-2-2': 4,
  '3-1-1': 3, '3-1-2': 4, '3-2-1': 4, '3-2-2': 5,
};

const TABLE_B = {
  '1-1-1': 1, '1-1-2': 2, '1-2-1': 2, '1-2-2': 3,
  '2-1-1': 1, '2-1-2': 2, '2-2-1': 3, '2-2-2': 4,
};

const TABLE_C = [
  [1, 1, 1, 2, 3, 3],
  [1, 2, 2, 3, 4, 4],
  [2, 3, 3, 3, 4, 5],
  [3, 4, 4, 4, 5, 6]
];

const MMH_MATRIX = {
  Male: [
    { zone: 'Above Shoulder (>140cm)', close: 10, far: 5 },
    { zone: 'Shoulder to Elbow (100-140cm)', close: 20, far: 10 },
    { zone: 'Elbow to Knuckle (75-100cm)', close: 25, far: 15 },
  ],
  Female: [
    { zone: 'Above Shoulder (>140cm)', close: 7, far: 3 },
    { zone: 'Shoulder to Elbow (100-140cm)', close: 13, far: 7 },
    { zone: 'Elbow to Knuckle (75-100cm)', close: 16, far: 10 },
  ]
};

// --- VISION HTML ENGINE (WITH CAMERA FALLBACK FIX) ---
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

      window.ReactNativeWebView.postMessage(JSON.stringify({
        humanDetected: true,
        trunk: Math.min(Math.max(Math.floor(trunkAngle / 20), 1), 4),
        neck: Math.min(Math.max(Math.floor(neckAngle / 15), 1), 3)
      }));
    });

    function drawSkeleton(lm, ctx, w, h) {
      const connections = [[11,12], [11,13], [13,15], [12,14], [14,16], [11,23], [12,24], [23,24]];
      ctx.strokeStyle = '#00FF66';
      ctx.lineWidth = 3;
      connections.forEach(([i, j]) => {
        ctx.beginPath();
        ctx.moveTo(lm[i].x * w, lm[i].y * h);
        ctx.lineTo(lm[j].x * w, lm[j].y * h);
        ctx.stroke();
      });
    }

    async function startCamera() {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          video.srcObject = stream;
          const camera = new Camera(video, {
            onFrame: async () => { await pose.send({ image: video }); },
            width: 640, height: 480
          });
          camera.start();
        } catch(e) {
          console.error("Camera access denied or failed", e);
        }
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

  // Simplified Inputs Only
  const [operatorName, setOperatorName] = useState('OP-101');
  const [processName, setProcessName] = useState('Spot Welding');
  const [gender, setGender] = useState('Male');
  const [weight, setWeight] = useState('12');

  // Dynamic Joint Postures (Calculated by MediaPipe Vision)
  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);

  // Request Android Camera Permissions
  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          { title: "Camera Permission", message: "App needs access to camera for pose estimation." }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {        return false;
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
      }
    } catch (e) {}
  };

  // Calculations
  const loadNum = parseFloat(weight) || 0;
  const rebaScore = humanDetected ? (TABLE_C[Math.min(trunk - 1, 3)][Math.min(neck - 1, 1)] || 1) : '-';
  const rwl = 23 * 0.83 * 0.90; 
  const liftingIndex = (loadNum / rwl).toFixed(2);
  const mmhLimit = MMH_MATRIX[gender][1]['close'];

  // PDF Report Export
  const exportPDFReport = async () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Arial, sans-serif; font-size: 11px; color: #222; }
            .page { page-break-after: always; height: 95vh; display: flex; flex-direction: column; justify-content: space-between; }
            .header { border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 12px; }
            .header h2 { margin: 0; color: #111; }
            .meta-box { background: #f2f2f2; padding: 10px; margin-bottom: 12px; border-radius: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
            th { background: #333; color: #fff; }
            .footer { text-align: center; font-size: 9px; color: #777; border-top: 1px solid #ccc; padding-top: 4px; }
          </style>
        </head>
        <body>
          <div class="page">
            <div>
              <div class="header"><h2>REBA EVALUATION REPORT</h2></div>
              <div class="meta-box">
                <p><strong>Operator Name:</strong> ${operatorName} | <strong>Process:</strong> ${processName}</p>
                <p><strong>Calculated REBA Score:</strong> ${rebaScore}</p>
              </div>
              <table>
                <tr><th>POSTURE SEGMENT</th><th>SCORE</th></tr>
                <tr><td>Trunk Posture</td><td>${trunk}</td></tr>
                <tr><td>Neck Posture</td><td>${neck}</td></tr>
              </table>
            </div>
            <div class="footer">Page 1 of 3 - REBA Ergonomic Audit</div>
          </div>

          <div class="page">
            <div>
              <div class="header"><h2>NIOSH LIFTING INDEX REPORT</h2></div>
              <div class="meta-box">
                <p><strong>Load Weight:</strong> ${loadNum} kg | <strong>Recommended Weight Limit (RWL):</strong> ${rwl.toFixed(2)} kg</p>
                <p><strong>Lifting Index (LI):</strong> ${liftingIndex}</p>
              </div>
            </div>
            <div class="footer">Page 2 of 3 - NIOSH Lifting Analysis</div>
          </div>

          <div class="page">
            <div>
              <div class="header"><h2>MMH CAPACITY MATRIX REPORT</h2></div>
              <div class="meta-box">
                <p><strong>Operator Gender:</strong> ${gender} | <strong>Max Capacity:</strong> ${mmhLimit} kg</p>
              </div>
              <table>
                <tr><th>LIFTING ZONE</th><th>MAX ALLOWED LOAD</th></tr>
                ${MMH_MATRIX[gender].map(r => `<tr><td>${r.zone}</td><td>${r.close} kg</td></tr>`).join('')}
              </table>
            </div>
            <div class="footer">Page 3 of 3 - MMH Guidelines</div>
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri);
    } catch (err) {
      Alert.alert('Export Error', 'Could not generate PDF report.');
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
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      </View>

      <View style={styles.dashboard}>
        {/* Top Indicators */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>REBA SCORE</Text><Text style={styles.scoreVal}>{rebaScore}</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>NIOSH LI</Text><Text style={styles.scoreVal}>{liftingIndex}</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>MMH LIMIT</Text><Text style={styles.scoreVal}>{mmhLimit} kg</Text></View>
        </View>

        <ScrollView style={styles.formContainer}>
          <Text style={styles.sectionHeader}>Required Inputs</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Operator Name / ID</Text>
            <TextInput style={styles.input} value={operatorName} onChangeText={setOperatorName} placeholder="Enter Operator Name" placeholderTextColor="#666" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Process Name</Text>
            <TextInput style={styles.input} value={processName} onChangeText={setProcessName} placeholder="Enter Process Name" placeholderTextColor="#666" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Gender</Text>
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
            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput style={styles.input} value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="10" placeholderTextColor="#666" />
          </View>
        </ScrollView>

        {/* Action Buttons */}
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
