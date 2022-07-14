/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-plus-operands */

import Dexie, { Table } from 'dexie'
import Compressor from 'compressorjs'

/**
 * S3同期時、S3に施す操作
 * 'insert': S3に保存する
 * 'delete': S3から削除する
 * 'stay': 何もしない
 */
export type Operation = 'insert' | 'delete' | 'stay'

/**
 * indexedDBに保存する画像管理オブジェクトのベース
 * 画像データと、どのような操作をされたかを持っている
 */
export interface PhotoState {
  /**
   * S3に保存されているかどうか
   */
  isOnS3: boolean
  /**
   * S3同期時に行う操作
   * @see {@link Operation}
   */
  s3Operation: Operation // S3同期時に行う操作
  /**
   * ファイル名
   */
  fileName: string
  /**
   * mime
   */
  mime: string
  /**
   * ユーザーによって保存ボタンが押されたかどうか
   * @defaultValue false
   */
  isStoredByUser: boolean
  /**
   * 写真の有効期限(エポック秒)
   * TODO: ファイル名にエポック使ってるから要らないかも 2021/11/25 habu
   */
  expirationDate: number // 写真の有効期限(エポック秒)
  /**
   * 写真データ
   * NOTE: indexedDBの外側では、画像をblobとして扱う
   * BUG: iPadでは、indexedDBでBlobを扱うことができない。その代わりArrayBufferで保存する方法がある。
   * @see {@link https://stackoverflow.com/questions/40393488/mobile-safari-10-indexeddb-blobs}
   */
  blob: Blob
}

/**
 * indexedDBに保存する画像管理オブジェクト
* NOTE: indexedDBの外側では、画像をblobとして扱う
* BUG: iPadでは、indexedDBでBlobを扱うことができない。その代わりArrayBufferで保存する方法がある。
* @see {@link https://stackoverflow.com/questions/40393488/mobile-safari-10-indexeddb-blobs}
 */
export type PhotoStateInIDB = Omit<PhotoState, 'blob'> & { blob: ArrayBuffer }

export const THUMBNAIL_WIDTH = 70
export const THUMBNAIL_HEIGHT = 70

/**
 * indexedDBの管理とS3への連携を行うクラス
 * ここでは必要最低限の機能を提供する
 */
export class PhotoDB extends Dexie {
  /**
   * indexedDBデータベース名
   */
  private static readonly _DB_NAME: string = 'DisasterInvDB'
  private static readonly _DB_STORE_NAME: string = 'photoDB'
  /**
   * 有効期限差分。エポックミリ秒で1日分にしている。
   */
  private static readonly EXPIRATION_DELTA: number = 86400000
  /**
   * サムネイル用に保存する画像の暗黙的ファイル名プレフィックス
   */
  private static readonly THUMBNAIL_PREFIX: string = 'thumbnail'
  /**
   * サムネイル用画像のクオリティ
   */
  private static readonly THUMBNAIL_QUALITY: number = 0.2
  /**
   * lazyなqueryで一度に返却する要素数
   */
  private static readonly ONCE_QUERY_LIMIT: number = 40

  photostate!: Table<PhotoStateInIDB>

  constructor() {
    super(PhotoDB._DB_NAME)
    this.version(2).stores({
      photostate: '++id, &fileName, expirationDate'
    })
  }

  /**
   * 画像サイズを軽量化する
   * @param value PhotoState
   * @param quality 画質 0 - 1 の少数
   * @param maxWidth 最大横幅px
   * @param maxHeight 最大縦幅px
   * @returns 
   */
  private async compressSub(file: Blob, quality = 0.9, maxWidth = 1500, maxHeight = 1500): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      new Compressor(file, { quality, maxWidth, maxHeight, success: resolve, error: reject })
    })
  }

  /**
   * 画像サイズを軽量化する
   * @param value PhotoState
   * @param quality 画質 0 - 1 の少数
   * @param maxWidth 最大横幅px
   * @param maxHeight 最大縦幅px
   * @returns 
   */
  private async compress(value: PhotoState, quality = 0.9, maxWidth = 1500, maxHeight = 1500): Promise<PhotoState> {
    if (!value.blob.type) {
      value.blob = new Blob([value.blob], { type: value.mime })
    }
    const compressed: Blob = await this.compressSub(value.blob, quality, maxWidth, maxHeight)
    return { ...value, blob: compressed }
  }

  /**
   * PhotoStateInIDBからPhotoStateに変換する
   * mobile iOSのindexedDBから取ってきた画像arraybufferをblobに変換して出力
   * @param state PhotoStateInIDB
   * @returns PhotoState
   */
  private convertInToOut(state: PhotoStateInIDB): PhotoState {
    return { ...state, blob: new Blob([state.blob], { type: state.mime }) }
  }

  /**
   * PhotoStateからPhotoStateInIDBに変換する
   * mobile iOSのindexedDBに画像を保存するため、blobからarraybufferに変換する
   * @param state PhotoState
   * @returns PhotoStateInIDB
   */
  private async convertOutToIn(state: PhotoState): Promise<PhotoStateInIDB> {
    let arraybuffer: ArrayBuffer = new ArrayBuffer(0)
    await state.blob.arrayBuffer().then(ab => { arraybuffer = ab })
    return { ...state, blob: arraybuffer }
  }

  public async putItem(record: PhotoState): Promise<void> {
    const compressed: PhotoState = await this.compress(record)
    await this.photostate.put(await this.convertOutToIn(record))
  }

  public async getItem(key: string): Promise<PhotoState | undefined> {
    const ret = await this.photostate.get({ fileName: key })
    if (!ret) return
    return this.convertInToOut(ret)
  }

  public async putThumbnail(record: PhotoState): Promise<void> {
    await this.putItem({ ...(await this.compress(record)), fileName: PhotoDB.THUMBNAIL_PREFIX + record.fileName })
  }

  public async putItemWithThumbnail(record: PhotoState): Promise<void> {
    await this.putItem(record)
    await this.putThumbnail(record)
  }

  public async queryPrefixMatch(key: string): Promise<Array<PhotoState>> {
    const ret = await this.photostate.where('fileName').startsWith(key).toArray()
    if (ret.length < 1) {
      return []
    }
    return ret.map((item: PhotoStateInIDB) => this.convertInToOut(item))
  }

  public async queryThumbnail(key: string): Promise<Array<PhotoState>> {
    return await this.queryPrefixMatch(PhotoDB.THUMBNAIL_PREFIX + key)
  }
}

export const photoDB = new PhotoDB()