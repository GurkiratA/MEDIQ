import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import * as native from './screen-native.mjs'

/**
 * MEDIQ's screenshot and screen-recording tools.
 *
 * Captured directly by this process (screen-native.mjs), not through the
 * browser — see there for why. That means these tools push a status update
 * rather than asking the browser and waiting on a reply: the browser has
 * nothing to do here except show that it's happening.
 *
 * Three tools rather than one "screen" tool with a mode argument, because
 * start/stop are a pair the model has to get right across two separate turns
 * of conversation ("record this" ... later ... "stop") and giving each its
 * own name makes that obvious from the tool list alone.
 */

const SCREENSHOT_DESCRIPTION = `Take a screenshot of the user's whole screen.

Use it when they ask to capture, screenshot, or grab what's on screen right
now. Instant — no picker, no permission to wait on. Saves the image and
returns its path — mention where it landed, don't describe the picture
itself, you haven't seen it.`

const START_DESCRIPTION = `Start recording the whole screen.

Use it when the user asks to record their screen or capture what they're
about to do. Starts immediately. Keeps going until \`stop_screen_recording\`
is called, so remember that one is owed.`

const STOP_DESCRIPTION = `Stop the screen recording that is in progress and save it.

Use it when the user says to stop recording, or the recording is otherwise
done. Returns the saved path — mention where it landed. Calling this without
an active recording is an error; say so rather than inventing a path.`

/**
 * @param {(status: 'screenshot' | 'recording' | null) => void} pushStatus
 *   Tells the browser what's happening now, for the on-screen banner.
 */
export function screenServer(pushStatus) {
  return createSdkMcpServer({
    name: 'mediq_screen',
    version: '1.0.0',
    instructions:
      "The user's whole screen, captured directly by this process. Use it " +
      'only when asked to screenshot or record — it is an act, not a sensor, ' +
      'even though it needs no permission dialog to run.',
    alwaysLoad: true,
    tools: [
      tool('screenshot', SCREENSHOT_DESCRIPTION, {}, async () => {
        pushStatus('taking a screenshot')
        try {
          const path = await native.screenshot()
          return { content: [{ type: 'text', text: `Screenshot saved to ${path}.` }] }
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Could not take the screenshot: ${err?.message ?? err}` }],
          }
        } finally {
          pushStatus(null)
        }
      }),
      tool('start_screen_recording', START_DESCRIPTION, {}, async () => {
        try {
          await native.startRecording()
          pushStatus('recording the screen')
          return { content: [{ type: 'text', text: 'Recording started.' }] }
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Could not start recording: ${err?.message ?? err}` }],
          }
        }
      }),
      tool('stop_screen_recording', STOP_DESCRIPTION, {}, async () => {
        try {
          const path = await native.stopRecording()
          return { content: [{ type: 'text', text: `Recording saved to ${path}.` }] }
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Could not stop recording: ${err?.message ?? err}` }],
          }
        } finally {
          pushStatus(null)
        }
      }),
    ],
  })
}
