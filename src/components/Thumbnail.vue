<template>
  <div class="thumbnail">
    <div v-for="(b, name) in showable" :key=name>
      <div>{{name}}</div>
      <ImageCanvas :blob=b.blob :photoId=b.fileName />
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent } from '@vue/composition-api'
import { PhotoState } from '@/modules/PhotoDB'
import ImageCanvas from '@/components/ImageCanvas.vue'

export default defineComponent ({
  name: 'ThumbnailComp',
  components: {
    ImageCanvas
  },
  props: {
    blobs: {
      type: Array,
      required: true
    }
  },
  setup (props, _) {
    const showable = computed(() => {
      if (props.blobs.length < 1) {
        return []
      }
      return (props.blobs as PhotoState[]).map((b: PhotoState) => {
        return {...b, fileName: b.fileName.replace(/\//, '')}
      })
    })
    return {
      showable
    }
  }
})
</script>

<style scoped>
.thumbnail {
  width: 100%;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
</style>