/** modules/api/controllers/Category.php */
const { sql } = require('drizzle-orm');
const categoryModel = require('../model/category.model');
const { intval, str, toBool } = require('../utils/php');

const SUBCATEGORY_COUNT = `( SELECT COUNT(category_id) FROM wl_categories AS b
		WHERE b.parent_id=a.category_id ) AS total_subcategories`;

function imagePaths(ci, data) {
  data.category_image_path = `${ci.baseUrl()}uploaded_files/category`;
  data.product_no_image_path = `${ci.baseUrl()}uploaded_files/products/noimg.png`;
}

/** GET|POST /api/category/category_listing — parent_id, keyword */
async function categoryListing(req, res) {
  const { ci } = req;
  const parentSegment = intval(ci.input.getPost('parent_id'));
  const keyword = ci.input.getPost('keyword');
  const parentId = parentSegment > 0 ? parentSegment : '0';

  if (parentSegment > 0) {
    // Looked up by PHP for a page title that the API never returns; kept for identical side effects.
    await categoryModel.getCategoryRow(ci, parentSegment);
  }

  let condition = sql` AND parent_id = ${str(parentId)} AND status='1' `;
  if (str(keyword) !== '') condition = sql`${condition} AND category_name like ${`%${str(keyword)}%`}`;

  const { rows, total } = await categoryModel.getCategory(ci, {
    field: `a.category_id,category_name,category_description,category_image,parent_id,${SUBCATEGORY_COUNT}`,
    condition,
    order: 'sort_order ASC ',
  });

  const data = { total_category: total };
  if (rows) {
    data.success = 'true';
    data.res = rows;
  } else {
    data.success = 'false';
    data.res = [];
    data.error = 'No Records Found !';
  }
  imagePaths(ci, data);
  ci.out.json(data);
}

/** /api/category and /api/category/index */
async function index(req, res) {
  return categoryListing(req, res);
}

/** GET|POST /api/category/sub_category — category_id */
async function subCategory(req, res) {
  const { ci } = req;
  const categoryId = ci.input.getPost('category_id');
  let data = {};
  if (toBool(categoryId)) {
    const { rows, total } = await categoryModel.getCategory(ci, {
      field: `*,${SUBCATEGORY_COUNT}`,
      condition: sql`AND parent_id = ${str(categoryId)} AND status='1'  `,
    });
    data.res = [];
    if (rows) {
      data.success = 'true';
      data.total_subcategory = total;
      data.res = rows;
    } else {
      data.success = 'false';
      data.total_subcategory = '0';
      data.res = [];
      data.error = 'No Records Found !';
    }
  } else {
    data = { success: 'false', total_subcategory: '0', res: [], error: 'No Records Found !' };
  }
  imagePaths(ci, data);
  ci.out.json(data);
}

module.exports = { index, categoryListing, subCategory };
