package db

import (
	"time"
)

// File 上传至本地文件信息表
type File struct {
	Id        int32      `gorm:"column:id;primary_key;NOT NULL" json:"id,omitempty"`
	CreatedAt *time.Time `gorm:"column:createdAt;default:CURRENT_TIMESTAMP;NOT NULL" json:"createdAt,omitempty"`
	UpdatedAt *time.Time `gorm:"column:updatedAt;NOT NULL" json:"updatedAt,omitempty"`
	Path      string     `gorm:"column:path;NOT NULL;index:idx_file_path" json:"path,omitempty"`
}

func (i *File) TableName() string {
	return "File"
}
