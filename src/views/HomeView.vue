<template>
  <div class="home">
    <Shooter @shooted=shootedFunc />
    <Thumbnail :blobs=blobs />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'
import Shooter from '@/components/Shooter.vue'
import Thumbnail from '@/components/Thumbnail.vue'
import { PhotoDB, PhotoState } from '@/modules/PhotoDB'

export default defineComponent({
  name: 'HomeView',
  components: {
    Shooter,
    Thumbnail
  },
  setup (props, context) {
    const blobs = ref<any>([])
    const photoDB = PhotoDB.instance
    const shootedFunc = () => {
      photoDB.queryPrefixMatch('photo').then((ret: PhotoState[]) => {
        blobs.value = ret.map(r => {
          return r.blob
        })
      })
    }
    return {
      blobs,
      shootedFunc
    }
  }
});
</script>
