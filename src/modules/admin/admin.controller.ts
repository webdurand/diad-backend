import { Controller, Post, Body } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('upload-json')
  async uploadFromJsonFile(
    @Body() body: { fileName: string; entityName: string },
  ) {
    const { fileName, entityName } = body;
    return this.adminService.uploadFromJsonFile(fileName, entityName);
  }

  @Post('all')
  async getAllData(@Body() body: { entityName: string }) {
    const { entityName } = body;
    return this.adminService.returnAll(entityName);
  }

  // @Post('relation-test')
  // async testEquipmentCategoryRelation() {
  //   return this.adminService.testEquipmentCategoryRelation();
  // }

  @Post('clear-table')
  async clearTable(@Body() body: { entityName: string }) {
    const { entityName } = body;
    return this.adminService.clearTable(entityName);
  }
}
