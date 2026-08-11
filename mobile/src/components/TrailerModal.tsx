import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { API_ORIGIN } from '../config';
import { tokens } from '../theme';

type Props = {
  visible: boolean;
  trailerId: string;
  title: string;
  onClose: () => void;
};

const trustedNavigation = (navigation: WebViewNavigation) => {
  const url = navigation.url.toLowerCase();
  return url === 'about:blank'
    || url.startsWith(API_ORIGIN.toLowerCase())
    || url.startsWith('https://www.youtube.com/')
    || url.startsWith('https://www.youtube-nocookie.com/')
    || url.startsWith('https://i.ytimg.com/')
    || url.startsWith('https://s.ytimg.com/');
};

function trailerHtml(videoId: string) {
  const safeId = /^[a-zA-Z0-9_-]{6,20}$/.test(videoId) ? videoId : '';
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#player{margin:0;width:100%;height:100%;background:#000;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style></head>
<body><div id="player"></div><script src="https://www.youtube.com/iframe_api"></script><script>
function send(payload){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(payload));}
function onYouTubeIframeAPIReady(){
  new YT.Player('player',{videoId:${JSON.stringify(safeId)},playerVars:{autoplay:1,playsinline:1,rel:0,modestbranding:1,origin:${JSON.stringify(API_ORIGIN)}},events:{onReady:function(){send({type:'ready'});},onError:function(event){send({type:'error',code:event.data});}}});
}
</script></body></html>`;
}

export function TrailerModal({ visible, trailerId, title, onClose }: Props) {
  const [error, setError] = useState('');
  const html = useMemo(() => trailerHtml(trailerId), [trailerId]);

  useEffect(() => {
    if (visible) setError('');
  }, [trailerId, visible]);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close trailer">
            <MaterialCommunityIcons name="close" size={27} color="#F7F4F5" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.title}>{title}</Text>
            <Text variant="labelSmall" style={styles.muted}>Official trailer</Text>
          </View>
        </View>
        <View style={styles.player}>
          {trailerId ? (
            <WebView
              source={{ html, baseUrl: `${API_ORIGIN}/` }}
              style={styles.webView}
              originWhitelist={['https://*', 'about:*']}
              onShouldStartLoadWithRequest={trustedNavigation}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled={false}
              thirdPartyCookiesEnabled={false}
              setSupportMultipleWindows={false}
              allowsFullscreenVideo
              androidLayerType="hardware"
              onMessage={(event) => {
                try {
                  const message = JSON.parse(event.nativeEvent.data) as { type?: string; code?: number };
                  if (message.type === 'error') setError(`YouTube could not play this trailer in-app (error ${message.code || 'unknown'}).`);
                  else if (message.type === 'ready') setError('');
                } catch { /* Ignore messages not produced by the embedded player. */ }
              }}
              onError={() => setError('The trailer could not be loaded. Check your connection and try again.')}
              accessibilityLabel={`${title} trailer player`}
            />
          ) : null}
        </View>
        {error ? <View style={styles.error}><MaterialCommunityIcons name="alert-circle-outline" size={22} color={tokens.color.brandBright} /><Text variant="bodyMedium" style={styles.errorText}>{error}</Text><Button mode="text" onPress={onClose}>Close</Button></View> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050506' },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#282429' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, paddingRight: 16 },
  title: { color: '#F7F4F5', fontWeight: '600' },
  muted: { color: '#A8A1A5', marginTop: 2 },
  player: { width: '100%', aspectRatio: 16 / 9, marginTop: 24, backgroundColor: '#000000' },
  webView: { flex: 1, backgroundColor: '#000000' },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#302A2E' },
  errorText: { flex: 1, color: '#D7D0D4' },
});
