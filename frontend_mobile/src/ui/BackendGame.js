import { useRef, useState } from 'react'
import { Text, TextInput, View } from 'react-native'
import PalaceDialog from './PalaceDialog.js'
import { ActionRow, Body, Button, Columns, Kicker, ServerError, SmallPrint } from './primitives.js'
import { colors, fonts, useScreen } from './theme.js'
import Tap from './Tap.js'

export { ServerError }

function Field({ label, inputRef, ...props }) {
  const { s } = useScreen()
  const [focused, setFocused] = useState(false)
  return <View style={{ marginTop: s(10) }}>
    <Text className="font-bold text-parchment" style={{ fontSize: s(13), marginBottom: s(6) }}>{label}</Text>
    <TextInput ref={inputRef} disableFullscreenUI placeholderTextColor="#8d8274" selectionColor={colors.gold} cursorColor={colors.gold} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className="border text-parchment" style={{ fontSize: s(15), paddingHorizontal: s(12), paddingVertical: s(10), borderRadius: s(9), backgroundColor: '#15110f', borderColor: focused ? colors.focus : '#75614e', opacity: props.editable === false ? 0.7 : 1 }} {...props} />
  </View>
}

const USERNAME = /^[A-Za-z0-9_.-]+$/
export function AuthScreen({ flow, state, busy }) {
  const { s, wide } = useScreen()
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState(''), [password, setPassword] = useState('')
  const [attempted, setAttempted] = useState(false)
  const passwordRef = useRef(null)
  const valid = username.length >= 3 && USERNAME.test(username) && password.length >= 8
  const hint = !username ? 'Enter your username.' : username.length < 3 || !USERNAME.test(username) ? 'Usernames use 3–32 letters, numbers, dots, dashes or underscores.' : password.length < 8 ? 'Passwords need at least 8 characters.' : null
  const submit = () => {
    setAttempted(true)
    if (!busy && valid) flow.authenticate(mode, { username, password })
  }
  const intro = <View style={{ flex: wide ? 0.85 : undefined, gap: s(14) }}>
    <Body muted>{mode === 'login' ? 'Your next adventure begins with a little knowledge.' : 'Create your account to begin your learning adventure.'}</Body>
    {wide && <View className="flex-row items-center" style={{ gap: s(14) }}>
      <View className="items-center justify-center border" style={{ width: s(54), height: s(62), borderRadius: s(18), borderBottomLeftRadius: s(26), borderBottomRightRadius: s(26), borderColor: 'rgba(205,183,134,0.47)', backgroundColor: 'rgba(205,183,134,0.05)' }}>
        <Text style={{ color: colors.goldBright, fontSize: s(32) }}>♜</Text>
      </View>
      <Text className="flex-1 text-sage" style={{ fontSize: s(12), lineHeight: s(18) }}>Turn your study PDFs into a storybook forest. Recall what you read to face its guardians and free the princess.</Text>
    </View>}
  </View>
  const form = <View style={{ flex: wide ? 1 : undefined }}>
    <Field label="Username" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={32} returnKeyType="next" value={username} onChangeText={setUsername} editable={!busy} onSubmitEditing={() => passwordRef.current?.focus()} submitBehavior="submit" />
    <Field label="Password" inputRef={passwordRef} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} textContentType={mode === 'register' ? 'newPassword' : 'password'} maxLength={256} returnKeyType="go" value={password} onChangeText={setPassword} editable={!busy} onSubmitEditing={submit} />
    {attempted && hint && <SmallPrint style={{ color: colors.goldSoft }}>{hint}</SmallPrint>}
    <ServerError error={state.error} />
    <Button variant="primary" full busy={busy} disabled={busy} label={busy ? 'Connecting…' : mode === 'login' ? 'Sign In' : 'Create Account'} onPress={submit} />
    {state.error && <Button full disabled={busy || !valid} label="Retry" onPress={submit} />}
    <Button variant="text" disabled={busy} label={mode === 'login' ? 'Create account' : 'Back to Sign In'} onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setPassword(''); setAttempted(false); flow.clearError() }} />
  </View>
  return <PalaceDialog wide={wide} tools={false} title={mode === 'login' ? 'Sign In' : 'Create Account'} kicker="Memory Palace">
    {wide ? <View className="flex-row" style={{ gap: s(24) }}>{intro}{form}</View> : <>{intro}{form}</>}
  </PalaceDialog>
}

const OUTCOME = { none: 'Practice complete', in_progress: 'Battle continues', won: 'Victory!', lost: 'Battle lost. Practice and try again.', knocked_out: 'Defeated. Practice to restore health.' }

function AnswerOption({ text, selected, disabled, onPress, half }) {
  const { s } = useScreen()
  return <Tap accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: half ? '48.6%' : '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, gap: s(9), paddingVertical: s(8), paddingHorizontal: s(10), borderRadius: s(9), borderColor: selected ? colors.gold : 'rgba(188,165,124,0.4)', backgroundColor: selected ? 'rgba(232,192,122,0.14)' : pressed ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)', opacity: disabled ? 0.6 : 1 })}>
    <View className="items-center justify-center border-2" style={{ width: s(18), height: s(18), borderRadius: s(9), borderColor: selected ? colors.gold : '#a89b86' }}>
      {selected && <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: colors.gold }} />}
    </View>
    <Text className="flex-1 font-semibold text-parchment" numberOfLines={3} style={{ fontSize: s(13), lineHeight: s(18) }}>{text}</Text>
  </Tap>
}

function StudyConcept({ text }) {
  const { s } = useScreen()
  const [open, setOpen] = useState(false)
  return <View style={{ marginTop: s(8) }}>
    <Tap accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} hitSlop={6}>
      <Text style={{ color: '#f0d5a8', fontSize: s(13) }}>{open ? '▾' : '▸'} Study this concept</Text>
    </Tap>
    {open && <Body style={{ marginTop: s(4), fontSize: s(13), lineHeight: s(19) }}>{text}</Body>}
  </View>
}

// Questions and results are laid out in two columns so a whole encounter fits one
// landscape screen. `note` sits above the question, `footer` holds errors and recovery,
// and `actions` are buttons shared by every state, laid out in one row at the bottom.
export function Encounter({ session, state, item, note, footer, actions = [] }) {
  const { s, width } = useScreen()
  const q = state.attempt
  const [draft, setDraft] = useState({ attemptId: null, value: '' })
  const answer = draft.attemptId === q?.attempt_id ? draft.value : ''
  const setAnswer = (value) => setDraft({ attemptId: q.attempt_id, value })
  const r = state.result
  if (r) return <View accessibilityLiveRegion="polite">
    <Columns ratio={1.15}
      left={<View style={{ gap: s(8) }}>
        {note}
        <Text className="text-snow" style={{ fontFamily: fonts.serif, fontSize: s(22), lineHeight: s(26) }}>{r.correct ? 'Correct!' : 'Keep learning.'}</Text>
        <View className="border" style={{ padding: s(10), borderRadius: s(9), borderColor: r.correct ? 'rgba(159,219,196,0.47)' : 'rgba(229,178,154,0.47)', backgroundColor: r.correct ? 'rgba(145,197,165,0.05)' : 'rgba(215,152,137,0.05)', gap: s(4) }}>
          <Body style={{ fontSize: s(13), lineHeight: s(19) }}>{r.feedback.explanation}</Body>
          <Body style={{ fontSize: s(13), lineHeight: s(19) }}>Answer: {r.feedback.correct_answer}</Body>
        </View>
      </View>}
      right={<View style={{ gap: s(4) }}>
        <Text className="font-bold text-goldsoft" style={{ fontSize: s(15) }}>{OUTCOME[r.encounter.outcome]}</Text>
        <Body muted style={{ fontSize: s(13), lineHeight: s(18) }}>XP {r.xp_delta >= 0 ? '+' : ''}{r.xp_delta} · Health {r.health_delta >= 0 ? '+' : ''}{r.health_delta}{r.encounter.question_count ? ` · ${r.encounter.correct_count} correct / ${r.encounter.question_count} battle questions` : ''}</Body>
        {r.encounter.adventure_unlocked_now && <Body style={{ fontSize: s(13) }}>Adventure is now unlocked!</Body>}
        {r.encounter.adventure_completed && <Text className="text-goldsoft" style={{ fontFamily: fonts.serif, fontSize: s(15), lineHeight: s(20), marginTop: s(2) }}>You have saved your princess with your knowledge.</Text>}
        {(q || item) && <Button variant="primary" full compact disabled={state.busy || !!state.unresolved} label={q ? 'Continue to the next question' : 'Practice another question'} onPress={() => { session.continue(); if (!q) session.practice() }} />}
      </View>} />
    {footer}
    <ActionRow>{!q && <Button compact disabled={state.busy} label="Finish review" onPress={() => session.continue()} />}{actions}</ActionRow>
  </View>
  if (!q) return <View>{note}<Body muted>{state.busy ? 'Awaiting the backend…' : 'No pending question. Approach a story item to study, or the current guardian to battle.'}</Body>{footer}<ActionRow>{actions}</ActionRow></View>
  const locked = state.busy || !!state.unresolved
  const submit = () => { if (!locked && answer.trim()) session.answer(answer) }
  const grid = (q.options?.length || 0) >= 3 && width >= 600
  return <View key={q.attempt_id}>
    <Columns ratio={0.9}
      left={<View>
        {note}
        <Kicker style={{ marginBottom: s(3), fontSize: s(9), letterSpacing: s(1.6) }}>{q.mode === 'adventure' ? q.battle?.villain_name : 'Practice'} · {q.topic} · Difficulty {q.difficulty}</Kicker>
        {q.battle && <Text className="text-goldsoft" style={{ fontSize: s(12), marginBottom: s(2) }}>Question {q.battle.question_number}/{q.battle.question_count} · {q.battle.correct_count} correct</Text>}
        <Text className="text-snow" style={{ fontSize: s(17), lineHeight: s(23), marginTop: s(4) }}>{q.prompt}</Text>
        {!!(item && q.mode === 'practice' && q.learning_objective) && <StudyConcept text={q.learning_objective} />}
        {q.sources?.map((src, i) => <SmallPrint key={i} style={{ marginTop: s(6), fontSize: s(11) }}>{src.document_name || 'Study document'}{src.pages?.length ? ` · pages ${src.pages.join(', ')}` : ''}</SmallPrint>)}
      </View>}
      right={<View accessibilityRole="radiogroup" className="border" style={{ padding: s(10), borderRadius: s(9), borderColor: 'rgba(188,165,124,0.33)' }}>
        <Text className="text-gold" style={{ fontSize: s(12), marginBottom: s(6) }}>Your answer</Text>
        {q.options?.length
          ? <View style={{ flexDirection: grid ? 'row' : 'column', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: s(6) }}>
              {q.options.map((o) => <AnswerOption key={o.id} half={grid} text={o.text} selected={answer === o.id} disabled={locked} onPress={() => setAnswer(o.id)} />)}
            </View>
          : <TextInput accessibilityLabel="Your answer" disableFullscreenUI keyboardType={q.type === 'numeric' ? 'decimal-pad' : 'default'} returnKeyType="done" maxLength={200} value={answer} onChangeText={setAnswer} onSubmitEditing={submit} editable={!locked} placeholder="Type your answer" placeholderTextColor="#8d8274" selectionColor={colors.gold}
              className="border text-parchment" style={{ fontSize: s(16), paddingHorizontal: s(12), paddingVertical: s(8), borderRadius: s(9), backgroundColor: '#15110f', borderColor: '#75614e' }} />}
        <Button variant="primary" full compact busy={state.busy} disabled={locked || !answer.trim()} label={state.busy ? 'Submitting…' : 'Submit answer'} onPress={submit} />
      </View>} />
    {footer}
    <ActionRow>{actions}</ActionRow>
  </View>
}

export function Recovery({ session, state, onRetry }) {
  return <>
    <ServerError error={state.error} />
    {state.unresolved && <View accessibilityRole="alert"><Body>The last action has an uncertain result. Retry it safely before continuing.</Body><Button variant="primary" full compact disabled={state.busy} label="Retry" onPress={() => session.retry()} /></View>}
    {state.error && !state.unresolved && <Button full compact disabled={state.busy} label="Retry" onPress={onRetry || (() => session.refresh())} />}
  </>
}
