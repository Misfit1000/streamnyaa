import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Text, useTheme } from 'react-native-paper';
import type { Anime } from '../types';
import { tokens } from '../theme';

type Props = {
  items: Anime[];
  width: number;
  height: number;
  onOpen: (anime: Anime) => void;
  onWatch: (anime: Anime) => void;
  onToggleSave: (anime: Anime) => void;
  isSaved: (anime: Anime) => boolean;
};

export function FeaturedCarousel({ items, width, height, onOpen, onWatch, onToggleSave, isSaved }: Props) {
  const theme = useTheme();
  const list = useRef<FlatList<Anime>>(null);
  const activeIndexRef = useRef(0);
  const interacting = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const slides = items.filter((item) => Boolean(item.cover)).slice(0, 5);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    activeIndexRef.current = Math.min(activeIndexRef.current, Math.max(0, slides.length - 1));
    setActiveIndex(activeIndexRef.current);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2 || reduceMotion) return undefined;
    const timer = setInterval(() => {
      if (interacting.current) return;
      const next = (activeIndexRef.current + 1) % slides.length;
      activeIndexRef.current = next;
      setActiveIndex(next);
      list.current?.scrollToIndex({ index: next, animated: true });
    }, 7_000);
    return () => clearInterval(timer);
  }, [reduceMotion, slides.length, width]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
    activeIndexRef.current = next;
    setActiveIndex(next);
    interacting.current = false;
  };

  if (!slides.length) return null;
  return (
    <View style={[styles.root, { borderColor: theme.colors.outlineVariant }]} accessibilityRole="adjustable" accessibilityLabel={`Featured titles, item ${activeIndex + 1} of ${slides.length}`}>
      <LinearGradient colors={['#21070D', '#0A090B', '#050506']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `spotlight-${item.metadataProvider || 'media'}-${item.id}`}
        getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={settle}
        onScrollBeginDrag={() => { interacting.current = true; }}
        onScrollEndDrag={() => { setTimeout(() => { interacting.current = false; }, 700); }}
        onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset({ offset: width * index, animated: true })}
        renderItem={({ item }) => {
          const saved = isSaved(item);
          return (
            <Pressable onPress={() => onOpen(item)} style={({ pressed }) => [styles.slide, { width, height, opacity: pressed ? 0.96 : 1 }]} accessibilityRole="button" accessibilityLabel={`${item.title}. Featured title`}>
              <View style={styles.copy}>
                <View style={styles.accent} />
                <Text variant="headlineSmall" numberOfLines={2} style={styles.title}>{item.title}</Text>
                <View style={styles.metadata}>
                  {item.score ? <><MaterialCommunityIcons name="star" size={15} color={tokens.color.warning} /><Text variant="labelMedium" style={styles.metaText}>{item.score.toFixed(1)}</Text></> : null}
                  {item.format ? <Text variant="labelMedium" style={styles.metaText}>{item.format.replaceAll('_', ' ')}</Text> : null}
                  {item.year ? <Text variant="labelMedium" style={styles.metaText}>{item.year}</Text> : null}
                </View>
                <Text variant="bodySmall" numberOfLines={2} style={styles.description}>{item.description?.replace(/<[^>]+>/g, '') || 'Start watching with automatic mobile source selection.'}</Text>
                <View style={styles.actions}>
                  <Button mode="contained" icon="play" onPress={(event) => { event.stopPropagation(); onWatch(item); }} contentStyle={styles.watchContent}>Play</Button>
                  <Pressable style={[styles.saveButton, saved && styles.saveButtonActive]} onPress={(event) => { event.stopPropagation(); onToggleSave(item); }} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from My List' : 'Add to My List'}>
                    <MaterialCommunityIcons name={saved ? 'check' : 'plus'} size={24} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.artworkFrame}>
                <Image source={item.cover} style={styles.artwork} contentFit="cover" cachePolicy="memory-disk" priority={activeIndexRef.current === slides.indexOf(item) ? 'high' : 'normal'} transition={reduceMotion ? 0 : 160} accessibilityIgnoresInvertColors />
                <LinearGradient colors={['transparent', 'rgba(5,5,6,0.34)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
              </View>
            </Pressable>
          );
        }}
      />
      {slides.length > 1 ? <View style={styles.indicators}>{slides.map((item, index) => <View key={`spotlight-indicator-${item.id}`} style={[styles.indicator, index === activeIndex && styles.indicatorActive]} />)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', borderRadius: tokens.radius.card, borderWidth: StyleSheet.hairlineWidth, backgroundColor: '#08080A' },
  slide: { flexDirection: 'row', overflow: 'hidden' },
  copy: { width: '60%', justifyContent: 'center', gap: 8, paddingLeft: 18, paddingRight: 10, paddingBottom: 14 },
  accent: { width: 34, height: 3, borderRadius: 2, backgroundColor: tokens.color.brandBright },
  title: { color: '#F7F4F5', fontWeight: '700', letterSpacing: -0.4, lineHeight: 28 },
  metadata: { minHeight: 22, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metaText: { color: '#D3CDD0' },
  description: { color: '#A9A2A6', lineHeight: 18 },
  actions: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  watchContent: { minHeight: 46, paddingHorizontal: 14 },
  saveButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.control, backgroundColor: '#242126' },
  saveButtonActive: { backgroundColor: '#4B101D' },
  artworkFrame: { width: '40%', height: '100%', backgroundColor: '#111014' },
  artwork: { width: '100%', height: '100%' },
  indicators: { position: 'absolute', left: 18, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  indicator: { width: 6, height: 3, borderRadius: 2, backgroundColor: '#5E585D' },
  indicatorActive: { width: 22, backgroundColor: tokens.color.brandBright },
});
