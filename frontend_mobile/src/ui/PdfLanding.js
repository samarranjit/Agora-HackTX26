import { ActivityIndicator, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import PalaceDialog from './PalaceDialog.js'
import { Body, Button, Divider, SmallPrint } from './primitives.js'
import { colors, fonts, useScreen } from './theme.js'
import { PDF_MAX_BYTES } from '../api/config.js'
import Tap from './Tap.js'

// Opens the system document picker and returns { uri, name, size, type } or null.
async function pickPdf() {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false })
  if (result.canceled || !result.assets?.length) return undefined
  if (result.assets.length !== 1) return null
  const asset = result.assets[0]
  let size = asset.size
  if (!Number.isFinite(size)) { try { size = new File(asset.uri).size } catch { size = 0 } }
  return { uri: asset.uri, name: asset.name, size, type: asset.mimeType || '' }
}

function PackRow({ pack, busy, onSelect }) {
  const { s } = useScreen()
  return <View className="flex-row items-center justify-between" style={{ gap: s(12), paddingVertical: s(10) }}>
    <View className="flex-1" style={{ minWidth: 0 }}>
      <Text className="font-bold text-cream" numberOfLines={2} style={{ fontSize: s(14) }}>{pack.name}</Text>
      <Text className="text-sage" numberOfLines={1} style={{ fontSize: s(11), marginTop: s(3) }}>{pack.topic}</Text>
      <Text className="text-sage" numberOfLines={2} style={{ fontSize: s(11), marginTop: s(2) }}>{pack.status === 'ready' ? 'Questions ready' : pack.status === 'failed' ? 'Processing failed' : 'Processing'}{pack.error ? ` · ${pack.error}` : ''}</Text>
    </View>
    <Button disabled={busy} accessibilityLabel={`${pack.status === 'ready' ? 'Continue' : 'Check'} ${pack.name}`} label={pack.status === 'ready' ? 'Continue' : pack.status === 'failed' ? 'Check again' : 'Continue processing'} onPress={() => onSelect(pack.document_id)} />
  </View>
}

export default function PdfLanding({ state, onSelect, onRetry, onSelectPack, onRefresh }) {
  const { s, wide } = useScreen()
  const busy = ['checking', 'uploading', 'processing'].includes(state.phase)
  const choose = async () => {
    if (busy) return
    const picked = await pickPdf()
    if (picked !== undefined) onSelect(picked)
  }
  const library = <View style={{ flex: wide ? 1 : undefined, marginTop: wide ? 0 : s(16) }} accessibilityLabel="Saved study sets">
    <Text className="text-cream" style={{ fontFamily: fonts.serif, fontSize: s(21), marginBottom: s(6) }}>Your study sets</Text>
    <SmallPrint style={{ marginTop: 0 }}>Continue saved questions or upload a new PDF. Your current health, XP and guardian progress are shared across your study sets.</SmallPrint>
    {state.libraryStatus === 'loading' && <View className="flex-row items-center" style={{ gap: s(8), marginTop: s(12) }}><ActivityIndicator color={colors.goldSoft} /><Body muted>Loading your study sets…</Body></View>}
    {state.libraryStatus === 'ready' && !state.packs?.length && <Body style={{ marginTop: s(12) }}>No saved study sets yet. Choose your first PDF.</Body>}
    {state.libraryError && <View accessibilityRole="alert" style={{ marginTop: s(10) }}><Body>{state.libraryError.message}</Body><Button full disabled={busy} label="Retry study sets" onPress={onRefresh} /></View>}
    <View style={{ marginTop: s(6) }}>
      {state.packs?.map((pack, index) => <View key={pack.document_id}>{index > 0 && <Divider />}<PackRow pack={pack} busy={busy} onSelect={onSelectPack} /></View>)}
    </View>
    {state.libraryStatus === 'ready' && <Button variant="text" disabled={busy} label="Refresh study sets" onPress={onRefresh} />}
  </View>
  const upload = <View style={{ flex: wide ? 1 : undefined }}>
    <View className="flex-row items-center" style={{ gap: s(16), marginBottom: s(14) }}>
      <View className="items-center justify-center border" style={{ width: s(50), height: s(58), borderRadius: s(16), borderBottomLeftRadius: s(24), borderBottomRightRadius: s(24), borderColor: 'rgba(205,183,134,0.47)', backgroundColor: 'rgba(205,183,134,0.04)' }}>
        <Text style={{ color: colors.goldBright, fontSize: s(30) }}>♜</Text>
      </View>
      <Body style={{ flex: 1, color: colors.sageLight }}>Upload a PDF to begin your adventure.</Body>
    </View>
    <Tap accessibilityRole="button" accessibilityLabel="Choose study PDF" accessibilityState={{ disabled: busy }} disabled={busy} onPress={choose} style={({ pressed }) => ({ opacity: busy ? 0.55 : pressed ? 0.85 : 1 })}>
      <LinearGradient colors={['#2b4a49', '#263c40']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ alignItems: 'center', justifyContent: 'center', gap: s(8), minHeight: s(wide ? 150 : 130), padding: s(18), borderRadius: s(10), borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(215,195,144,0.67)' }}>
        <Text style={{ color: colors.goldBright, fontSize: s(30) }}>↥</Text>
        <Text className="text-center font-bold text-cream" style={{ fontSize: s(15) }}>Tap to choose a PDF</Text>
        <Text className="text-center text-sage" style={{ fontSize: s(12) }}>PDF only · up to {PDF_MAX_BYTES / 1024 / 1024} MB</Text>
      </LinearGradient>
    </Tap>
    {!!state.name && <Text className="text-cream" numberOfLines={2} style={{ marginTop: s(10), fontSize: s(13) }}>{state.name}</Text>}
    {busy && <View accessibilityLiveRegion="polite" className="flex-row items-center" style={{ gap: s(10), marginTop: s(12) }}>
      <ActivityIndicator color={colors.goldSoft} />
      <Text style={{ color: '#d1dacb', fontSize: s(13) }}>{state.phase === 'checking' ? 'Checking your PDF…' : state.phase === 'uploading' ? 'Uploading your PDF…' : state.stage === 'indexing' ? 'Reading your PDF…' : 'Preparing your questions…'}</Text>
    </View>}
    {state.phase === 'error' && <View accessibilityRole="alert" className="border" style={{ marginTop: s(12), padding: s(12), borderRadius: s(9), backgroundColor: colors.error, borderColor: colors.errorBorder }}>
      <Text style={{ color: colors.errorText, fontSize: s(13), lineHeight: s(19) }}>{state.error?.message || 'Your PDF could not be prepared. Please retry.'}</Text>
      {state.error?.ambiguous && <SmallPrint style={{ color: colors.errorText }}>The upload may have reached the server. Retrying can submit this PDF again.</SmallPrint>}
      <Button variant="primary" full label="Retry" onPress={() => state.name ? onRetry() : choose()} />
    </View>}
  </View>
  return <PalaceDialog wide={wide} tools={false} titleSize={wide ? 30 : 26} title="Your notes. A world to remember." kicker="Memory Palace">
    {wide ? <View className="flex-row" style={{ gap: s(26) }}>{upload}<View style={{ width: 1, backgroundColor: colors.borderSoft }} />{library}</View> : <>{upload}{library}</>}
  </PalaceDialog>
}
