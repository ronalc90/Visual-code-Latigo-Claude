import * as assert from 'node:assert/strict'

import { ClaudeFocusTracker, isClaudeConversationViewType } from '../../src/claudeTabs'

describe('claudeTabs', () => {
  it('reconoce la pestaña de conversacion de Claude Code con y sin el prefijo de VS Code', () => {
    assert.equal(isClaudeConversationViewType('claudeVSCodePanel'), true)
    assert.equal(isClaudeConversationViewType('mainThreadWebview-claudeVSCodePanel'), true)
  })

  it('no confunde otras pestañas de Claude ni de otras extensiones', () => {
    assert.equal(isClaudeConversationViewType('mainThreadWebview-claudePlanPreview'), false)
    assert.equal(isClaudeConversationViewType('mainThreadWebview-markdown.preview'), false)
    assert.equal(isClaudeConversationViewType('claudeVSCodePanelX'), false)
  })

  describe('ClaudeFocusTracker', () => {
    const claude = (key: string) => ({ isClaude: true, key })
    const other = (key: string) => ({ isClaude: false, key })

    it('avisa al entrar a una conversacion y no con eventos repetidos de la misma', () => {
      const tracker = new ClaudeFocusTracker()
      assert.equal(tracker.update(other('a.ts')), false)
      assert.equal(tracker.update(claude('chat 1')), true)
      assert.equal(tracker.update(claude('chat 1')), false)
      assert.equal(tracker.isClaudeActive, true)
    })

    it('avisa al pasar de una conversacion a otra y al volver desde otra pestaña', () => {
      const tracker = new ClaudeFocusTracker()
      assert.equal(tracker.update(claude('chat 1')), true)
      assert.equal(tracker.update(claude('chat 2')), true)
      assert.equal(tracker.update(other('a.ts')), false)
      assert.equal(tracker.isClaudeActive, false)
      assert.equal(tracker.update(claude('chat 2')), true)
    })

    it('sin pestaña activa no avisa, y reset hace que la siguiente vuelva a contar', () => {
      const tracker = new ClaudeFocusTracker()
      assert.equal(tracker.update(null), false)
      assert.equal(tracker.update(claude('chat 1')), true)
      tracker.reset()
      assert.equal(tracker.update(claude('chat 1')), true)
    })
  })
})
