const pathToFfmpeg = require('ffmpeg-ffprobe-static');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { default: OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

ffmpeg.setFfmpegPath(pathToFfmpeg.ffmpegPath);

/**
 * Envia um arquivo de áudio para a OpenAI para transcrição.
 * @param {string} audioPath - Caminho do arquivo de áudio.
 * @return {Promise<string>} - Uma Promise que resolve para a transcrição do áudio.
 */
const transcribeAudio = async (audioPath) => {
  console.log('Transcrevendo áudio...');
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model', 'whisper-1'); // Especifica o modelo de transcrição, se necessário

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );
    fs.unlinkSync(audioPath);
    return response.data.text;
  } catch (error) {
    console.error('Erro ao transcrever o áudio:', error);
    throw error;
  }
};

/**
 * Formata um timestamp em segundos para o formato SRT.
 * @param {number} seconds - O timestamp em segundos.
 * @return {string} - O timestamp formatado para SRT.
 */
const formatTimestamp = (seconds) => {
  const date = new Date(0);
  date.setSeconds(seconds);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
};

/**
 * Cria um arquivo de legenda SRT a partir das transcrições.
 * @param {string[]} transcriptions - As transcrições de áudio.
 * @param {string} outputSrtPath - Caminho do arquivo SRT de saída.
 * @param {number} segmentDuration - Duração de cada segmento em segundos (padrão é 60).
 */
const createSrtFile = async (
  transcriptions,
  outputSrtPath,
  segmentDuration = 60
) => {
  const srtLines = transcriptions.map((text, index) => {
    const startTime = formatTimestamp(index * segmentDuration);
    const endTime = formatTimestamp((index + 1) * segmentDuration);
    return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
  });

  fs.writeFileSync(outputSrtPath, srtLines.join('\n'), 'utf-8');
  console.log(`Arquivo de legenda SRT criado: ${outputSrtPath}`);
  await translateToPortugueseSRT(outputSrtPath);
};

/**
 * Processa todos os segmentos de áudio em uma pasta e cria um arquivo de legenda SRT.
 * @param {string} segmentsFolderPath - Caminho da pasta contendo os segmentos de áudio.
 * @param {string} outputSrtPath - Caminho do arquivo SRT de saída.
 * @return {Promise<void>} - Uma Promise que resolve quando todas as transcrições e a criação do arquivo SRT estiverem concluídas.
 */
const processAudioSegments = async (segmentsFolderPath) => {
  console.log('Processando segmentos de áudio...', segmentsFolderPath);
  const outputSrtPath = path.join(__dirname, 'output.srt');

  fs.readdir(segmentsFolderPath, async (err, files) => {
    if (err) {
      console.error('Erro ao ler a pasta:', err);
      return;
    }

    console.log(files);

    // Filtra apenas os arquivos de áudio
    const audioFiles = files.filter((file) => /\.mp3$/i.test(file));
    const transcriptions = [];

    console.log(`Audios encontrados: ${audioFiles.length}`);

    for (const audioFile of audioFiles) {
      const audioPath = path.join(segmentsFolderPath, audioFile);
      try {
        const transcription = await transcribeAudio(audioPath);
        transcriptions.push(transcription);
      } catch (error) {
        console.error(`Erro ao transcrever o arquivo ${audioFile}:`, error);
      }
    }

    // Cria o arquivo SRT com as transcrições
    createSrtFile(transcriptions, outputSrtPath);
  });
};

/**
 * Divide o áudio em segmentos de 60 segundos.
 * @param {string} inputAudioPath - Caminho do arquivo de áudio de entrada.
 * @param {string} outputFolderPath - Caminho da pasta de saída para os segmentos de áudio.
 * @param {number} segmentDuration - Duração de cada segmento em segundos (padrão é 60).
 * @return {Promise<void>} - Uma Promise que resolve quando a divisão estiver concluída.
 */
const splitAudio = (
  inputAudioPath,
  outputFolderPath,
  prefix,
  segmentDuration = 60
) => {
  console.log('Dividindo áudio...');
  return new Promise((resolve, reject) => {
    ffmpeg(inputAudioPath)
      .outputOptions([
        '-f',
        'segment',
        `-segment_time`,
        segmentDuration,
        '-c',
        'copy',
      ])
      .on('end', () => {
        console.log(
          `Áudio dividido em segmentos de ${segmentDuration} segundos.`
        );
        resolve();
      })
      .on('error', (err) => {
        console.error('Erro ao dividir o áudio:', err);
        reject(err);
      })
      .save(path.join(outputFolderPath, `${prefix}_%03d.mp3`));
  });
};

/**
 * Extrai o áudio de um vídeo.
 * @param {string} inputVideoPath - Caminho do arquivo de vídeo de entrada.
 * @param {string} outputAudioPath - Caminho do arquivo de áudio de saída.
 * @return {Promise<void>} - Uma Promise que resolve quando a extração estiver concluída.
 */
const extractAudio = (inputVideoPath) => {
  console.log('Extraindo áudio...');
  const myUUID = uuidv4();
  const outputAudioPath = path.join(folderPath, '..', 'temp', myUUID + '.mp3');
  return new Promise((resolve, reject) => {
    ffmpeg(inputVideoPath)
      .output(outputAudioPath)
      .noVideo()
      .on('end', () => {
        console.log('Extração de áudio concluída.');
        resolve({
          path: outputAudioPath,
          uuid: myUUID,
        });
      })
      .on('error', (err) => {
        console.error('Erro ao extrair áudio:', err);
        reject(err);
      })
      .run();
  });
};

const checkFoldersExists = async () => {
  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'));
  }

  if (!fs.existsSync(path.join(__dirname, 'videos'))) {
    fs.mkdirSync(path.join(__dirname, 'videos'));
  }
};

/**
 * Escaneia uma pasta e extrai o áudio de todos os arquivos de vídeo.
 * @param {string} folderPath - Caminho da pasta contendo os vídeos.
 */
const processVideosInFolder = async (folderPath) => {
  await checkFoldersExists;

  fs.readdir(folderPath, async (err, files) => {
    if (err) {
      console.error('Erro ao ler a pasta:', err);
      return;
    }

    // Filtra apenas os arquivos de vídeo (ex.: .mp4, .avi)
    const videoFiles = files.filter((file) =>
      /\.(mp4|avi|mov|mkv)$/i.test(file)
    );

    for (const videoFile of videoFiles) {
      const inputVideoPath = path.join(folderPath, videoFile);

      try {
        const { path: outputAudioPath, uuid } = await extractAudio(
          inputVideoPath
        );
        await splitAudio(
          outputAudioPath,
          path.join(folderPath, '..', 'temp'),
          uuid
        );
        fs.unlinkSync(outputAudioPath);
        await processAudioSegments(path.join(folderPath, '..', 'temp'));
      } catch (err) {
        console.error(`Falha ao processar ${videoFile}:`, err);
      }
    }
  });
};

const translateToPortugueseSRT = async (srtPath) => {
  const srtContent = fs.readFileSync(srtPath, 'utf-8');
  const lines = srtContent.split('\n');
  const translatedLines = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      translatedLines.push(lines[i]);
    } else {
      const text = lines[i];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Translate the following text to Portuguese: ' + text,
          },
        ],
      });

      const translation = completion.data.choices[0].message.content;

      translatedLines.push(translation);
    }
  }

  fs.writeFileSync(`output.pt-br.srt`, translatedLines.join('\n'), 'utf-8');

  console.log(`Arquivo de legenda SRT traduzido para português: ${srtPath}`);
};

const folderPath = path.join(__dirname, 'videos');

processVideosInFolder(folderPath);
