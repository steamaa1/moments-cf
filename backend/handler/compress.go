package handler

import (
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"

	"github.com/disintegration/imaging"
)

// CompressImage 接收图片路径并进行压缩
// 支持jpg和png格式的图片，并且会校验MIME类型
// 如果图片类型不是jpg或png，则不进行处理
// 返回错误信息
func CompressImage(f FileHandler, filePath string, thumbFilepath string, quality int) error {
	// 打开文件
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	// 获取文件信息
	fileInfo, err := file.Stat()
	if err != nil {
		return err
	}

	// 读取文件的前512字节
	buffer := make([]byte, 512)
	_, err = file.Read(buffer)
	if err != nil && err != io.EOF {
		return err
	}

	// 重置文件指针到开头
	_, err = file.Seek(0, 0)
	if err != nil {
		return err
	}

	// 检测MIME类型
	contentType := http.DetectContentType(buffer)

	// 解码图片
	img, format, err := image.Decode(file)
	if err != nil {
		return err
	}
	dst, err := os.Create(thumbFilepath)
	if err != nil {
		f.base.log.Error().Msgf("打开目标图片异常:%s", err)
		return err
	}
	// 复制图片
	if _, err = io.Copy(dst, file); err != nil {
		f.base.log.Error().Msgf("复制图片异常:%s", err)
		return err
	}

	// 校验MIME类型
	switch format {
	case "jpeg", "jpg":
		if contentType != "image/jpeg" {
			f.base.log.Error().Msgf("不支持的图片格式:%s", contentType)
			return err
		}
		// 重新打开文件以写入压缩后的图片
		file, err = os.OpenFile(thumbFilepath, os.O_WRONLY|os.O_TRUNC, fileInfo.Mode())
		if err != nil {
			return err
		}
		defer file.Close()
		dstImage := imaging.Resize(img, 600, 0, imaging.Lanczos)
		// 使用JPEG格式压缩图片
		err = jpeg.Encode(file, dstImage, &jpeg.Options{Quality: quality})
		if err != nil {
			return err
		}
	case "png":
		if contentType != "image/png" {
			f.base.log.Error().Msgf("不支持的图片格式:%s", contentType)
			return err
		}
		// 重新打开文件以写入压缩后的图片
		file, err = os.OpenFile(thumbFilepath, os.O_WRONLY|os.O_TRUNC, fileInfo.Mode())
		if err != nil {
			return err
		}
		defer file.Close()
		dstImage := imaging.Resize(img, 600, 0, imaging.Lanczos)

		// 使用PNG格式压缩图片
		err = png.Encode(file, dstImage)
		if err != nil {
			return err
		}
	default:
		f.base.log.Error().Msgf("不支持的图片格式:%s", contentType)
	}

	return nil
}
