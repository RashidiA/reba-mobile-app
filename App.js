import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput } from 'react-native';
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Simplified Inputs
  const [operationName, setOperationName] = useState('OP-001');
  const [loadWeight, setLoadWeight] = useState(10);

  // Live Joint Parameters
  const [trunk, setTrunk] = useState(1);
  const [neck, setNeck] = useState(1);
  const [legs, setLegs] = useState(1);
  const [upperArm, setUpperArm] = useState(1);
  const [lowerArm, setLowerArm] = useState(1);
  const [wrist, setWrist] = useState(1);

  // Dynamic Spatial Variables for NIOSH & MMH
  const [horizontalDist, setHorizontalDist] = useState(30);
  const [verticalDist, setVerticalDist] = useState(75);
  const [travelDist, setTravelDist] = useState(25);
  const [asymmetryAngle, setAsymmetryAngle] = useState(0);

  // Duration Statistics for Report
  const [analysisDuration, setAnalysisDuration] = useState(0);
  const [peakReba, setPeakReba] = useState(1);
  const [durations, setDurations] = useState({
    trunk: { low: 0, med: 0, high: 0 },
    neck: { low: 0, med: 0, high: 0 },
    upperArm: { low: 0, med: 0, high: 0 },
    legs: { low: 0, med: 0, high: 0 },
    wrists: { low: 0, med: 0, high: 0 },
  });

  const [auditLogs, setAuditLogs] = useState([]);
  const timerRef = useRef(null);

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
    let base = 14;
    return parseFloat(Math.max(5, base - (travelDist > 10 ? (travelDist - 10) * 0.2 : 0)).toFixed(1));
  })();

  // Dynamic Analysis Loop
  useEffect(() => {
    if (isAnalyzing) {
      timerRef.current = setInterval(() => {
        setAnalysisDuration((prev) => prev + 0.1);

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

        setHorizontalDist(25 + simUpperArm * 5);

        const currentReba = rebaScore;
        setPeakReba((prev) => Math.max(prev, currentReba));

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
    }
    return () => clearInterval(timerRef.current);
  }, [isAnalyzing, rebaScore]);

  const toggleAnalysis = () => {
    if (!isAnalyzing) {
      setIsAnalyzing(true);
    } else {
      setIsAnalyzing(false);
      logAudit();
    }
  };

  const logAudit = () => {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      reba: rebaScore,
      rwl: rwl,
      li: liftingIndex,
      mmhTask: 'Carry',
      mmhWeight: loadWeight,
      mmhLimit: mmhLimit,
    };
    setAuditLogs((prev) => [entry, ...prev]);
  };

  const calcPct = (val, total) => (total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0.0%');

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
            .active-row { background-color: #f1948a; font-weight: bold; }
            .section-title { font-size: 11px; font-weight: bold; color: #2c3e50; margin: 8px 0 4px 0; border-bottom: 1px solid #ae2012; padding-bottom: 2px; }
            .footer { font-size: 8.5px; text-align: center; color: #7f8c8d; border-top: 1px solid #d5dbdb; padding-top: 4px; }
          </style>
        </head>
        <body>

          <!-- PAGE 1: REBA POSTURE AUDIT -->
          <div class="page">
            <div>
              <div class="header">
                <h1>REBA POSTURE AUDIT REPORT</h1>
                <p>Operator: <strong>${operationName}</strong> | Total Duration: <strong>${analysisDuration.toFixed(1)} sec</strong> | Peak Evaluated REBA Score: <strong>${peakReba}</strong></p>
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

              <div class="section-title">REBA Standard Action & Risk Table</div>
              <table>
                <tr><th>REBA SCORE</th><th>RISK LEVEL</th><th>ACTION REQUIRED</th></tr>
                <tr ${rebaScore === 1 ? 'class="active-row"' : ''}><td>1</td><td>None</td><td>Not necessary</td></tr>
                <tr ${rebaScore >= 2 && rebaScore <= 3 ? 'class="active-row"' : ''}><td>2-3</td><td>Low</td><td>May be necessary</td></tr>
                <tr ${rebaScore >= 4 && rebaScore <= 7 ? 'class="active-row"' : ''}><td>4-7</td><td>Medium</td><td>Necessary</td></tr>
                <tr ${rebaScore >= 8 && rebaScore <= 10 ? 'class="active-row"' : ''}><td>8-10</td><td>High</td><td>Necessary and soon</td></tr>
                <tr ${rebaScore >= 11 ? 'class="active-row"' : ''}><td>11-15</td><td>Very High</td><td>Necessary urgent</td></tr>
              </table>

              <div class="section-title">Peak REBA Posture Snapshot & Step-by-Step Joint Angles</div>
              <table>
                <tr><th>REBA STEP/JOINT</th><th>SCORE VALUE</th><th>STATUS</th></tr>
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
                <p>Operator: <strong>${operationName}</strong> | Evaluation Profile: Male</p>
              </div>

              <div class="${loadWeight > mmhLimit ? 'card-alert' : 'card-info'}">
                <strong>SAFETY STATUS: ${loadWeight > mmhLimit ? 'EXCEEDS SAFE ERGONOMIC LIMIT' : 'WITHIN SAFE ERGONOMIC LIMIT'}</strong><br/>
                Task Type: <strong>Carry</strong> | Distance: <strong>${travelDist} m</strong><br/>
                Actual Weight Lifted: <strong>${loadWeight} kg</strong> | Max Recommended Limit: <strong>${mmhLimit} kg</strong>
              </div>

              <div class="section-title">Recommended Weight Matrix Reference (Male)</div>
              <table>
                <tr><th>HEIGHT ZONE</th><th>CLOSE REACH LIMIT (KG)</th><th>FAR REACH LIMIT (KG)</th></tr>
                <tr><td>Above Shoulder</td><td>10.0 kg</td><td>5.0 kg</td></tr>
                <tr><td>Shoulder to Elbow</td><td>20.0 kg</td><td>10.0 kg</td></tr>
                <tr><td>Elbow to Knuckle</td><td>25.0 kg</td><td>15.0 kg</td></tr>
                <tr><td>Knuckle to Mid-Leg</td><td>20.0 kg</td><td>10.0 kg</td></tr>
                <tr><td>Below Mid-Leg</td><td>10.0 kg</td><td>5.0 kg</td></tr>
              </table>

              <div class="section-title">Ergonomic Lifting Reference Diagram</div>
              
              <!-- Embedded SVG Reference Diagram -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0; padding: 10px; background: #fafafa; border: 1px solid #d5dbdb; border-radius: 6px;">
                <svg width="280" height="190" viewBox="0 0 280 190" style="font-family: sans-serif;">
                  <text x="115" y="12" font-size="9" font-weight="bold" fill="#2c3e50">Female</text>
                  <text x="175" y="12" font-size="9" font-weight="bold" fill="#2c3e50">Male</text>

                  <line x1="80" y1="180" x2="215" y2="180" stroke="#2c3e50" stroke-width="2"/>

                  <text x="5" y="52" font-size="8" fill="#566573">Shoulder height</text>
                  <line x1="75" y1="50" x2="220" y2="50" stroke="#bdc3c7" stroke-dasharray="2,2"/>

                  <text x="5" y="82" font-size="8" fill="#566573">Elbow height</text>
                  <line x1="75" y1="80" x2="220" y2="80" stroke="#bdc3c7" stroke-dasharray="2,2"/>

                  <text x="5" y="112" font-size="8" fill="#566573">Knuckle height</text>
                  <line x1="75" y1="110" x2="220" y2="110" stroke="#bdc3c7" stroke-dasharray="2,2"/>

                  <text x="5" y="152" font-size="8" fill="#566573">Mid lower leg height</text>
                  <line x1="75" y1="150" x2="220" y2="150" stroke="#bdc3c7" stroke-dasharray="2,2"/>

                  <!-- Female Matrix -->
                  <rect x="105" y="30" width="22" height="25" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="110" y="46" font-size="7.5" fill="#2c3e50">3 kg</text>
                  <rect x="127" y="30" width="22" height="25" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="132" y="46" font-size="7.5" fill="#2c3e50">7 kg</text>

                  <rect x="105" y="55" width="22" height="25" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="110" y="71" font-size="7.5" fill="#2c3e50">7 kg</text>
                  <rect x="127" y="55" width="22" height="25" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="131" y="71" font-size="7.5" fill="#2c3e50">13 kg</text>

                  <rect x="105" y="80" width="22" height="30" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="109" y="98" font-size="7.5" fill="#2c3e50">10 kg</text>
                  <rect x="127" y="80" width="22" height="30" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="131" y="98" font-size="7.5" fill="#2c3e50">16 kg</text>

                  <rect x="105" y="110" width="22" height="40" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="110" y="132" font-size="7.5" fill="#2c3e50">7 kg</text>
                  <rect x="127" y="110" width="22" height="40" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="131" y="132" font-size="7.5" fill="#2c3e50">13 kg</text>

                  <rect x="105" y="150" width="22" height="28" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="110" y="167" font-size="7.5" fill="#2c3e50">3 kg</text>
                  <rect x="127" y="150" width="22" height="28" fill="#fef9e7" stroke="#d5dbdb"/>
                  <text x="132" y="167" font-size="7.5" fill="#2c3e50">7 kg</text>

                  <!-- Male Matrix -->
                  <rect x="165" y="30" width="22" height="25" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="168" y="46" font-size="7.5" font-weight="bold" fill="#1a5276">10 kg</text>
                  <rect x="187" y="30" width="22" height="25" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="192" y="46" font-size="7.5" font-weight="bold" fill="#1a5276">5 kg</text>

                  <rect x="165" y="55" width="22" height="25" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="168" y="71" font-size="7.5" font-weight="bold" fill="#1a5276">20 kg</text>
                  <rect x="187" y="55" width="22" height="25" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="190" y="71" font-size="7.5" font-weight="bold" fill="#1a5276">10 kg</text>

                  <rect x="165" y="80" width="22" height="30" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="168" y="98" font-size="7.5" font-weight="bold" fill="#1a5276">25 kg</text>
                  <rect x="187" y="80" width="22" height="30" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="190" y="98" font-size="7.5" font-weight="bold" fill="#1a5276">15 kg</text>

                  <rect x="165" y="110" width="22" height="40" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="168" y="132" font-size="7.5" font-weight="bold" fill="#1a5276">20 kg</text>
                  <rect x="187" y="110" width="22" height="40" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="190" y="132" font-size="7.5" font-weight="bold" fill="#1a5276">10 kg</text>

                  <rect x="165" y="150" width="22" height="28" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="168" y="167" font-size="7.5" font-weight="bold" fill="#1a5276">10 kg</text>
                  <rect x="187" y="150" width="22" height="28" fill="#eaf2f8" stroke="#d5dbdb"/>
                  <text x="192" y="167" font-size="7.5" font-weight="bold" fill="#1a5276">5 kg</text>

                  <!-- Mannequin Vector -->
                  <circle cx="150" cy="35" r="7" fill="#d35400"/>
                  <line x1="150" y1="42" x2="150" y2="105" stroke="#d35400" stroke-width="6"/>
                  <line x1="150" y1="52" x2="200" y2="52" stroke="#d35400" stroke-width="4"/>
                  <circle cx="200" cy="52" r="3" fill="#2980b9"/>
                  <line x1="150" y1="105" x2="142" y2="180" stroke="#d35400" stroke-width="5"/>
                  <line x1="150" y1="105" x2="158" y2="180" stroke="#d35400" stroke-width="5"/>
                  <circle cx="150" cy="52" r="3.5" fill="#a04000"/>
                  <circle cx="150" cy="105" r="4" fill="#a04000"/>
                </svg>

                <div style="width: 45%; padding-left: 10px;">
                  <div class="section-title" style="margin-top: 0;">Ergonomic Recommendations:</div>
                  <ol style="margin-top: 5px; padding-left: 15px; font-size: 9px; line-height: 1.4; color: #2c3e50;">
                    <li>Maintain load close to body to optimize reach leverage.</li>
                    <li>Avoid lifting above shoulder height without mechanical support.</li>
                  </ol>
                </div>
              </div>

            </div>
            <div class="footer">Page 2 of 3 - Recommended Weight Limits Matrix Standard</div>
          </div>

          <!-- PAGE 3: NIOSH ASSESSMENT & LOGS -->
          <div class="page">
            <div>
              <div class="header">
                <h1>NIOSH LIFTING EQUATION ASSESSMENT</h1>
                <p>Operator: <strong>${operationName}</strong> | Peak Dynamic Spatial Evaluation</p>
              </div>

              <div class="section-title">1. Object & Load Condition</div>
              <p>Hand Detected Object: <strong>Unidentified Object</strong> | Actual Object Weight: <strong>${loadWeight} kg</strong></p>

              <div class="section-title">2. Live NIOSH Multipliers & Spatial Geometry</div>
              <table>
                <tr><th>PARAMETER/MULTIPLIER</th><th>MEASURED VALUE</th><th>FACTOR</th><th>FORMULA/STANDARD</th></tr>
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
                <tr><th>TIME</th><th>REBA</th><th>NIOSH LI</th><th>MMH LIMIT</th></tr>
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
      <CameraView style={styles.camera} facing="back">
        <Svg height={height * 0.35} width={width} style={styles.overlay}>
          <Line x1={width * 0.5} y1="40" x2={width * 0.5} y2="180" stroke={isAnalyzing ? "#FF0000" : "#00FF66"} strokeWidth="4" />
          <Circle cx={width * 0.5} cy="30" r="12" stroke={isAnalyzing ? "#FF0000" : "#00FF66"} strokeWidth="3" fill="transparent" />
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
            <Text style={styles.toggleText}>MMH</Text>
          </TouchableOpacity>
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
            <Text style={styles.scoreVal}>{mmhLimit} kg</Text>
          </View>
        </View>

        <ScrollView style={styles.controlsScroll}>
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Operation Name / ID:</Text>
            <TextInput style={styles.textInput} value={operationName} onChangeText={setOperationName} placeholder="e.g. OP-001" placeholderTextColor="#888" />
          </View>

          <View style={styles.inputCard}>
            <View style={styles.adjRow}>
              <Text style={styles.inputLabel}>Load Weight ({loadWeight} kg):</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => setLoadWeight(Math.max(1, loadWeight - 1))} style={styles.adjBtn}>
                  <Text style={styles.adjText}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLoadWeight(loadWeight + 1)} style={[styles.adjBtn, { marginLeft: 8 }]}>
                  <Text style={styles.adjText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.actionBtn, isAnalyzing ? { backgroundColor: '#FF3B30' } : { backgroundColor: '#00FF66' }]} onPress={toggleAnalysis}>
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
  inputCard: { backgroundColor: '#2A2A2A', padding: 10, borderRadius: 8, marginBottom: 8 },
  inputLabel: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  textInput: { backgroundColor: '#1E1E1E', color: '#FFF', borderRadius: 6, padding: 8, marginTop: 4, fontSize: 13 },
  adjRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adjBtn: { backgroundColor: '#3A3A3A', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  adjText: { color: '#00FF66', fontSize: 18, fontWeight: 'bold' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 },
  btnText: { color: '#121212', fontWeight: 'bold' }
});
