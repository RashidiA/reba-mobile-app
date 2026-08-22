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

// --- MEDIAPIPE & VISION HTML LAYER ---
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

      // Draw 3D Pose Skeleton
      const landmarks = results.poseLandmarks;
      drawSkeleton(landmarks, ctx, canvas.width, canvas.height);

      // Angle Calculations
      const trunkAngle = Math.round(getAngle(landmarks[11], landmarks[23], landmarks[25]));
      const neckAngle = Math.round(getAngle(landmarks[0], landmarks[11], landmarks[23]));
      const armAngle = Math.round(getAngle(landmarks[11], landmarks[13], landmarks[15]));

      // Hand Object Detection
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

  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);
  const [legs] = useState(1);
  const [upperArm, setUpperArm] = useState(1);
  const [lowerArm] = useState(1);
  const [wrist] = useState(1);

  const [horizontalDist] = useState(30);
  const [verticalDist] = useState(85);

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

  const rebaScore = (() => {
    if (!humanDetected) return '-';
    const keyA = `${trunk}-${neck}-${legs}`;
    const scoreA = TABLE_A[keyA] || 1;
    const keyB = `${upperArm}-${lowerArm}-${wrist}`;
    const scoreB = TABLE_B[keyB] || 1;
    return TABLE_C[Math.min(scoreA - 1, 11)][Math.min(scoreB - 1, 11)];
  })();

  const activeMMHLimit = MMH_MATRIX[gender][2]['close'];

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
        <View style={styles.modeToggle}>
          {['REBA', 'NIOSH', 'MMH'].map((m) => (
            <TouchableOpacity key={m} style={[styles.toggleBtn, mode === m && styles.toggleActive]} onPress={() => setMode(m)}>
              <Text style={styles.toggleText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.objectCard}>
          <Text style={styles.scoreLabel}>HUMAN STATUS: <Text style={{ color: humanDetected ? '#00FF66' : '#FF3B30' }}>{humanDetected ? 'TRACKING LIVE' : 'NO HUMAN DETECTED'}</Text></Text>
          <Text style={[styles.objectValue, { color: detectedObject === 'No Object Detected' ? '#888' : '#00FF66' }]}>{detectedObject}</Text>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>REBA SCORE</Text><Text style={styles.scoreVal}>{rebaScore}</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>LOAD WEIGHT</Text><Text style={styles.scoreVal}>{loadWeight} kg</Text></View>
          <View style={styles.scoreBox}><Text style={styles.scoreLabel}>MMH LIMIT</Text><Text style={styles.scoreVal}>{activeMMHLimit} kg</Text></View>
        </View>

        <ScrollView style={styles.controlsScroll}>
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Operator ID:</Text>
            <TextInput style={styles.textInput} value={operationName} onChangeText={setOperationName} />
          </View>
        </ScrollView>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isAnalyzing ? '#FF3B30' : '#00FF66' }]} onPress={() => setIsAnalyzing(!isAnalyzing)}>
          <Text style={styles.btnText}>{isAnalyzing ? 'Stop Live Analysis' : 'Start Live Analysis'}</Text>
        </TouchableOpacity>
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
  controlsScroll: { flex: 1 },
  inputCard: { backgroundColor: '#2A2A2A', padding: 10, borderRadius: 8, marginBottom: 8 },
  inputLabel: { color: '#FFF', fontSize: 12 },
  textInput: { backgroundColor: '#1E1E1E', color: '#FFF', borderRadius: 6, padding: 6, marginTop: 4 },
  actionBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#121212', fontWeight: 'bold' }
});
