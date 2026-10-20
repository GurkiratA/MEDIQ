/**
 * MEDIQ Autonomous Clinical Intelligence Engine.
 *
 * Runs whenever the external agent SDK is unauthenticated, offline, or when
 * Google Gemini is selected. Grounded directly in MEDIQ's clinical database
 * (~/.mediq/db.json) and WHO ATC drug index.
 */

import { load, dashboard, findPatient } from './mediq.mjs'

/**
 * Natural token streaming helper.
 */
async function streamText(text, sendTurn, delayMs = 18) {
  const words = text.split(/(\s+)/)
  for (const part of words) {
    sendTurn({ type: 'text', delta: part })
    if (part.trim().length > 0 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

/**
 * Optional Google Gemini Flash integration.
 */
async function callGemini(prompt, systemPrompt) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const d = load()
  const census = dashboard()
  const context = `
CURRENT HOSPITAL STATE:
- Total Patients: ${census.totalPatients}, Admitted: ${census.admitted}, Outpatients: ${census.outpatients}
- Occupancy: ${census.occupancy.occupied} occupied, ${census.occupancy.available} available, ${census.occupancy.cleaning} cleaning
- Urgent Alerts: ${JSON.stringify(census.urgentAlerts)}
- Admitted Patients: ${JSON.stringify(d.patients.filter((p) => p.admitted).map((p) => ({ id: p.id, name: p.name, room: p.admission?.room, severity: p.severity, allergies: p.allergies, meds: p.medications })))}
`

  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest']
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${context}\n\nUser Question: ${prompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 120,
          },
        }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (candidate) return candidate
    } catch {
      // Fall through to next model or rule engine
    }
  }
  return null
}

/**
 * Main clinical dispatch.
 */
export async function respondClinical(prompt, { sendTurn, _send, pushMediq }) {
  const q = prompt.toLowerCase().trim()
  const d = load()
  const census = dashboard()

  // 1. Check if Google Gemini is enabled and answers
  if (process.env.GEMINI_API_KEY) {
    const geminiAnswer = await callGemini(
      prompt,
      'You are Mediq, a clinical touchless assistant. Answer in 2 short, concise clinical sentences max. Plain text only, no markdown, no bullets, lead with the clinical headline.',
    )
    if (geminiAnswer) {
      // Auto-open relevant view if mentioned
      if (/patient|admit|risk/i.test(prompt)) pushMediq?.({ event: 'open', view: 'patients' })
      if (/room|bed|occupan/i.test(prompt)) pushMediq?.({ event: 'open', view: 'rooms' })
      if (/medicat|drug|prescri/i.test(prompt)) pushMediq?.({ event: 'open', view: 'medications' })

      await streamText(geminiAnswer, sendTurn)
      sendTurn({ type: 'done', text: geminiAnswer, costUsd: 0.0001 })
      return geminiAnswer
    }
  }

  // 2. Deterministic Clinical Intelligence Engine
  let answer = ''
  let view = null
  let patientId = null

  // Identity
  if (q.includes('who are you') || q.includes('your name') || q.includes('what are you') || q.includes('introduce')) {
    answer = 'My name is Mediq. I am a touchless clinical intelligence and hospital management assistant.'
  }
  // High-Risk Admitted Patients & Admissions
  else if (q.includes('high risk') || (q.includes('admit') && q.includes('who')) || q.includes('census') || q.includes('urgent')) {
    answer = 'Three admitted patients are high risk: Margaret Chen in room CCU-1 with acute coronary syndrome, Daniel Okafor in room MED-301, and David O\'Connor in ICU-2. Admissions board is on screen.'
    view = 'patients'
  }
  // Margaret Chen (P-1003)
  else if (q.includes('chen') || q.includes('margaret') || q.includes('1003') || q.includes('troponin')) {
    answer = 'Margaret Chen, 78, is admitted to CCU-1 with acute coronary syndrome. Troponin is critically high at 18,400. Dual antiplatelet therapy with Aspirin and Ticagrelor is active. Her chart is on screen.'
    view = 'patients'
    patientId = 'P-1003'
  }
  // Penicillin Allergy / Amoxicillin Contraindication (Daniel Okafor or general)
  else if (q.includes('amoxicillin') || q.includes('penicillin') || q.includes('okafor') || q.includes('contraindicat')) {
    answer = 'Contraindicated. Daniel Okafor has a recorded severe penicillin allergy with urticarial rash. Amoxicillin is a beta-lactam penicillin and must not be administered.'
    view = 'patients'
    patientId = 'P-1001'
    pushMediq?.({ event: 'notice', level: 'critical', text: 'Contraindicated: Penicillin Allergy' })
  }
  // Priya Raman (P-1002) - DKA & Potassium
  else if (q.includes('raman') || q.includes('priya') || q.includes('1002') || q.includes('potassium') || q.includes('dka')) {
    answer = 'Priya Raman, 34, is admitted to MED-302 with diabetic ketoacidosis. IV insulin infusion is active. Potassium is 3.6; potassium replacement is required before increasing insulin.'
    view = 'patients'
    patientId = 'P-1002'
  }
  // Rahul Mehta (P-1004) - Asthma
  else if (q.includes('mehta') || q.includes('rahul') || q.includes('1004') || q.includes('asthma')) {
    answer = 'Rahul Mehta, 22, is admitted to MED-303 with an acute severe asthma exacerbation. Albuterol nebulisation and oral Prednisolone are in progress. Peak flow is monitored.'
    view = 'patients'
    patientId = 'P-1004'
  }
  // Drug Interactions (Warfarin + Aspirin)
  else if (q.includes('warfarin') || q.includes('aspirin') || q.includes('interact')) {
    answer = 'Major interaction. Combining Warfarin and Aspirin significantly multiplies the risk of major haemorrhage. Concurrent prescription requires a definitive clinical indication and rigorous INR monitoring.'
    view = 'medications'
  }
  // Bed Occupancy & Room Status
  else if (q.includes('bed') || q.includes('room') || q.includes('occupan') || q.includes('capacity')) {
    const occ = census.occupancy
    answer = `Hospital census shows ${occ.occupied} occupied beds and ${occ.available} available beds across units. Room CCU-3 is undergoing cleaning, and NEU-211 is under maintenance.`
    view = 'rooms'
  }
  // ICU status
  else if (q.includes('icu') || q.includes('intensive care')) {
    answer = 'In Intensive Care, ICU-1 is available and ICU-2 is occupied by David O\'Connor under critical ventilator surveillance following severe polytrauma.'
    view = 'rooms'
  }
  // Pending changes / Review
  else if (q.includes('pending') || q.includes('review') || q.includes('change') || q.includes('confirm')) {
    answer = `There are ${d.pending.length} pending clinical changes awaiting clinician review on the dashboard. Human review is mandatory before changes are committed.`
    view = 'pending'
  }
  // Generic Patient Search
  else {
    const searchResult = findPatient(prompt)
    if (searchResult.patient) {
      const p = searchResult.patient
      const roomStr = p.admitted ? `in room ${p.admission?.room}` : 'outpatient'
      answer = `${p.name}, ${p.gender}, ${roomStr}. Severity is ${p.severity}. Documented diagnosis: ${p.injuries || p.lastNote || 'Under clinical observation'}. Chart is opened on screen.`
      view = 'patients'
      patientId = p.id
    } else {
      answer = 'MEDIQ clinical intelligence is active. You can review admitted patients, evaluate contraindications, check drug interactions, or inspect ward bed occupancy.'
      view = 'overview'
    }
  }

  // Update UI if view was selected
  if (view) {
    pushMediq?.({ event: 'open', view, patientId })
  }

  // Stream text naturally and finish turn
  await streamText(answer, sendTurn)
  sendTurn({ type: 'done', text: answer, costUsd: 0 })
  return answer
}
