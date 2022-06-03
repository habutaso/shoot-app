<template>
  <div>
    <input type="file" accept="image/*" capture="camera" @change=onChangeFile />
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted } from '@vue/composition-api'
import { PhotoDB } from '@/modules/PhotoDB'
import { v4 as uuidv4 } from 'uuid'
export default defineComponent({
  name: 'ShooterComp',
  setup (props, context) {
    const photoDB = PhotoDB.instance()
    const onChangeFile = async (e: Event | null) => {
      console.log(e)
      if (!e || !e.target || !(e.target as HTMLInputElement).files) return
      const imageFile = (e.target as HTMLInputElement).files
      if (!imageFile) return 
      console.log((e.target as HTMLInputElement).files)
      const newBlob = new Blob([imageFile[0]])
      console.log(newBlob)
      const fileName = `photo-${uuidv4()}`
      const item = {
        isOnS3: false,
        s3Operation: 'insert',
        fileName,
        mime: imageFile[0].type,
        isStoredByUser: false,
        expirationDate: Date.now(),
        blob: newBlob
      }
      const interval = setInterval(() => {
        onChangeFileInterval(item)
      }, 5000)
      context.emit('shooted')
    }
    const onChangeFileInterval = async (item: any) => {
      const fileName = `photo-${uuidv4()}`
      await photoDB.insertItem({...item, fileName})
      context.emit('shooted')
    }
    return {
      onChangeFile
    }
  }
})
</script>

<style>

</style>